package com.kitchenassistant.xiaobaixiachuu.voice;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class KitchenAudioEngine implements AutoCloseable {
    interface Listener {
        void onWake(long generation, long detectedAt);
        void onAudioFrame(long generation, long sequence, String base64Pcm);
        void onSpeechEnd(long generation);
        void onSpeechDetected(long generation);
        void onError(String code, String message);
    }

    private static final int SAMPLE_RATE = 16000;
    private static final int FRAME_SAMPLES = 320;
    private static final int UPLOAD_FRAMES = 5;
    private static final int PRE_ROLL_FRAMES = 25;
    private static final long MAX_CAPTURE_MS = 20000;

    private final Context context;
    private final SherpaKeywordSpotter keywordSpotter;
    private final Listener listener;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean recording = new AtomicBoolean(false);
    private final ArrayDeque<short[]> preRoll = new ArrayDeque<>();
    private final AudioManager audioManager;
    private AudioRecord recorder;
    private volatile boolean preservePreRoll;
    private volatile long recordingToken;
    private AudioTrack player;
    private AudioFocusRequest focusRequest;

    KitchenAudioEngine(Context context, SherpaKeywordSpotter keywordSpotter, Listener listener) {
        this.context = context;
        this.keywordSpotter = keywordSpotter;
        this.listener = listener;
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    void startWake(long generation, long debounceMs) {
        if (keywordSpotter.getStatus() != SherpaKeywordSpotter.Status.READY) {
            listener.onError("MODEL_MISSING", "Local wake-word model is unavailable");
            return;
        }
        startRecorder(generation, Mode.WAKE, 0.018f, 900, debounceMs);
    }

    void startCommand(long generation, float rmsThreshold, int silenceMs) {
        startRecorder(generation, Mode.COMMAND, rmsThreshold, silenceMs, 0);
    }

    void startVad(long generation, float rmsThreshold) {
        startRecorder(generation, Mode.VAD, rmsThreshold, 0, 0);
    }

    private enum Mode { WAKE, COMMAND, VAD }

    private synchronized void startRecorder(
            long generation, Mode mode, float rmsThreshold, int silenceMs, long debounceMs) {
        preservePreRoll = mode == Mode.COMMAND;
        stopRecording();
        preservePreRoll = false;
        int minimum = AudioRecord.getMinBufferSize(
                SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord nextRecorder = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minimum, FRAME_SAMPLES * 8));
        if (nextRecorder.getState() != AudioRecord.STATE_INITIALIZED) {
            nextRecorder.release();
            listener.onError("AUDIO_RECORD_INIT", "AudioRecord initialization failed");
            return;
        }
        recorder = nextRecorder;
        long token = ++recordingToken;
        recording.set(true);
        try {
            nextRecorder.startRecording();
        } catch (Exception error) {
            stopRecording(token, nextRecorder);
            listener.onError("AUDIO_RECORD_START", error.getClass().getSimpleName());
            return;
        }
        executor.execute(() -> readLoop(
                generation, mode, rmsThreshold, silenceMs, debounceMs, token, nextRecorder));
    }

    private void readLoop(
            long generation,
            Mode mode,
            float rmsThreshold,
            int silenceMs,
            long debounceMs,
            long token,
            AudioRecord source) {
        short[] upload = new short[FRAME_SAMPLES * UPLOAD_FRAMES];
        int uploadOffset = 0;
        long sequence = 0;
        long started = android.os.SystemClock.elapsedRealtime();
        long lastSpeech = started;
        long lastWake = 0;
        boolean heardSpeech = false;

        if (mode == Mode.COMMAND) {
            synchronized (preRoll) {
                for (short[] buffered : preRoll) {
                    uploadOffset = appendAndEmit(buffered, upload, uploadOffset, generation, sequence++);
                }
                preRoll.clear();
            }
        }

        while (recording.get() && recordingToken == token) {
            short[] frame = new short[FRAME_SAMPLES];
            int read;
            try {
                read = source.read(frame, 0, frame.length, AudioRecord.READ_BLOCKING);
            } catch (Exception error) {
                listener.onError("AUDIO_RECORD_READ", error.getClass().getSimpleName());
                break;
            }
            if (read <= 0) continue;
            if (read < frame.length) frame = java.util.Arrays.copyOf(frame, read);
            remember(frame);
            float rms = rms(frame);
            long now = android.os.SystemClock.elapsedRealtime();

            if (mode == Mode.WAKE) {
                if (keywordSpotter.accept(frame) && now - lastWake >= debounceMs) {
                    lastWake = now;
                    listener.onWake(generation, System.currentTimeMillis());
                }
                continue;
            }
            if (mode == Mode.VAD) {
                if (rms >= rmsThreshold) {
                    listener.onSpeechDetected(generation);
                    break;
                }
                continue;
            }

            uploadOffset = appendAndEmit(frame, upload, uploadOffset, generation, sequence++);
            if (rms >= rmsThreshold) {
                heardSpeech = true;
                lastSpeech = now;
            }
            if ((heardSpeech && now - lastSpeech >= silenceMs) || now - started >= MAX_CAPTURE_MS) {
                listener.onSpeechEnd(generation);
                break;
            }
        }
        stopRecording(token, source);
    }

    private int appendAndEmit(short[] frame, short[] upload, int offset, long generation, long sequence) {
        int remaining = Math.min(frame.length, upload.length - offset);
        System.arraycopy(frame, 0, upload, offset, remaining);
        offset += remaining;
        if (offset == upload.length) {
            ByteBuffer bytes = ByteBuffer.allocate(upload.length * 2).order(ByteOrder.LITTLE_ENDIAN);
            for (short sample : upload) bytes.putShort(sample);
            listener.onAudioFrame(generation, sequence, Base64.encodeToString(bytes.array(), Base64.NO_WRAP));
            return 0;
        }
        return offset;
    }

    private void remember(short[] frame) {
        synchronized (preRoll) {
            preRoll.addLast(frame.clone());
            while (preRoll.size() > PRE_ROLL_FRAMES) preRoll.removeFirst();
        }
    }

    private static float rms(short[] frame) {
        double sum = 0;
        for (short sample : frame) {
            double normalized = sample / 32768.0;
            sum += normalized * normalized;
        }
        return (float) Math.sqrt(sum / Math.max(1, frame.length));
    }

    synchronized void startPlayback(int sampleRate, int channels) {
        stopPlayback();
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(change -> {
                    if (change <= AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                        stopPlayback();
                        listener.onError("AUDIO_FOCUS_LOST", "Audio focus was lost");
                    }
                })
                .build();
        audioManager.requestAudioFocus(focusRequest);
        int channelMask = channels == 1 ? AudioFormat.CHANNEL_OUT_MONO : AudioFormat.CHANNEL_OUT_STEREO;
        int minimum = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT);
        player = new AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelMask)
                        .build())
                .setBufferSizeInBytes(Math.max(minimum, sampleRate / 2))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build();
        player.play();
    }

    synchronized void enqueue(String base64Pcm) {
        if (player == null) throw new IllegalStateException("AudioTrack is not started");
        byte[] pcm = Base64.decode(base64Pcm, Base64.DEFAULT);
        player.write(pcm, 0, pcm.length, AudioTrack.WRITE_BLOCKING);
    }

    synchronized void finishPlayback() {
        if (player != null) player.stop();
        stopPlayback();
    }

    synchronized void stopPlayback() {
        if (player != null) {
            try { player.pause(); player.flush(); } catch (Exception ignored) {}
            player.release();
            player = null;
        }
        if (focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        }
    }

    synchronized void stopRecording() {
        recordingToken += 1;
        recording.set(false);
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            recorder.release();
            recorder = null;
        }
        if (!preservePreRoll) {
            synchronized (preRoll) { preRoll.clear(); }
        }
    }

    private synchronized void stopRecording(long token, AudioRecord source) {
        if (recordingToken == token && recorder == source) stopRecording();
    }

    @Override
    public void close() {
        stopRecording();
        stopPlayback();
        executor.shutdownNow();
        keywordSpotter.close();
    }
}
