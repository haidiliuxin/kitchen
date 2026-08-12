package com.kitchenassistant.xiaobaixiachuu.voice;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
        name = "XiaobaiVoice",
        permissions = @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }))
public class XiaobaiVoicePlugin extends Plugin implements KitchenAudioEngine.Listener {
    private SherpaKeywordSpotter spotter;
    private KitchenAudioEngine audio;

    @Override
    public void load() {
        spotter = new SherpaKeywordSpotter(getContext());
        audio = new KitchenAudioEngine(getContext(), spotter, this);
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "preparePermissionResult");
            return;
        }
        resolvePrepare(call);
    }

    private void resolvePrepare(PluginCall call) {
        JSObject result = new JSObject();
        SherpaKeywordSpotter.Status status = spotter.getStatus();
        result.put("supported", status == SherpaKeywordSpotter.Status.READY);
        String modelStatus = "runtime_missing";
        if (status == SherpaKeywordSpotter.Status.READY) modelStatus = "ready";
        else if (status == SherpaKeywordSpotter.Status.MODEL_MISSING) modelStatus = "missing";
        else if (status == SherpaKeywordSpotter.Status.MODEL_INVALID) modelStatus = "invalid";
        result.put("modelStatus", modelStatus);
        if (status != SherpaKeywordSpotter.Status.READY) result.put("errorCode", status.name());
        call.resolve(result);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void preparePermissionResult(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) resolvePrepare(call);
        else call.reject("Microphone permission denied", "PERMISSION_DENIED");
    }

    private boolean ensureMicrophone(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult");
            return false;
        }
        return true;
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) call.resolve();
        else call.reject("Microphone permission denied", "PERMISSION_DENIED");
    }

    @PluginMethod
    public void startWakeWord(PluginCall call) {
        if (!ensureMicrophone(call)) return;
        if (spotter.getStatus() != SherpaKeywordSpotter.Status.READY) {
            call.reject("Local wake-word model is not installed", "MODEL_MISSING");
            return;
        }
        audio.startWake(call.getLong("generation", 0L), 1500);
        call.resolve();
    }

    @PluginMethod public void stopWakeWord(PluginCall call) { audio.stopRecording(); call.resolve(); }

    @PluginMethod
    public void startCommandCapture(PluginCall call) {
        if (!ensureMicrophone(call)) return;
        audio.startCommand(
                call.getLong("generation", 0L),
                call.getFloat("rmsThreshold", 0.018f),
                call.getInt("silenceMs", 900));
        call.resolve();
    }

    @PluginMethod public void stopCommandCapture(PluginCall call) { audio.stopRecording(); call.resolve(); }

    @PluginMethod
    public void startConversationVad(PluginCall call) {
        if (!ensureMicrophone(call)) return;
        audio.startVad(call.getLong("generation", 0L), call.getFloat("rmsThreshold", 0.018f));
        call.resolve();
    }

    @PluginMethod public void stopConversationVad(PluginCall call) { audio.stopRecording(); call.resolve(); }

    @PluginMethod
    public void startPlayback(PluginCall call) {
        audio.stopRecording();
        audio.startPlayback(call.getInt("sampleRate", 24000), call.getInt("channels", 1));
        call.resolve();
    }

    @PluginMethod
    public void enqueuePcm(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("PCM data is required", "INVALID_PCM"); return; }
        try { audio.enqueue(data); call.resolve(); }
        catch (Exception error) { call.reject(error.getMessage(), "AUDIO_TRACK_WRITE"); }
    }

    @PluginMethod public void finishPlayback(PluginCall call) { audio.finishPlayback(); call.resolve(); }
    @PluginMethod public void stopPlayback(PluginCall call) { audio.stopPlayback(); call.resolve(); }
    @PluginMethod public void release(PluginCall call) { audio.stopRecording(); audio.stopPlayback(); call.resolve(); }

    @Override public void onWake(long generation, long detectedAt) {
        JSObject event = new JSObject();
        event.put("phrase", "小白小白"); event.put("generation", generation); event.put("detectedAt", detectedAt);
        notifyListeners("wakeDetected", event);
    }
    @Override public void onAudioFrame(long generation, long sequence, String data) {
        JSObject event = new JSObject();
        event.put("generation", generation); event.put("sequence", sequence); event.put("data", data);
        notifyListeners("audioFrame", event);
    }
    @Override public void onSpeechEnd(long generation) {
        JSObject event = new JSObject(); event.put("generation", generation); notifyListeners("speechEnd", event);
    }
    @Override public void onSpeechDetected(long generation) {
        JSObject event = new JSObject(); event.put("generation", generation); notifyListeners("speechDetected", event);
    }
    @Override public void onError(String code, String message) {
        JSObject event = new JSObject(); event.put("code", code); event.put("message", message);
        notifyListeners("nativeError", event);
    }

    @Override
    protected void handleOnDestroy() {
        if (audio != null) audio.close();
        super.handleOnDestroy();
    }
}
