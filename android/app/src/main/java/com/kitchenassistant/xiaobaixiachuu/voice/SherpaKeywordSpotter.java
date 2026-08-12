package com.kitchenassistant.xiaobaixiachuu.voice;

import android.content.Context;
import android.content.res.AssetManager;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

final class SherpaKeywordSpotter implements AutoCloseable {
    enum Status { READY, MODEL_MISSING, MODEL_INVALID, RUNTIME_MISSING }

    static final String VERSION = "1.13.5";
    static final String MODEL_ID = "sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20";
    static final String KEYWORD = "x iǎo b ái x iǎo b ái :1.0 #0.25 @小白小白";
    private static final String MANIFEST = "kws/model-manifest.json";

    private final Status status;

    SherpaKeywordSpotter(Context context) {
        Status modelStatus = validateManifest(context.getAssets());
        if (modelStatus != Status.READY) {
            status = modelStatus;
            return;
        }
        Status runtimeStatus;
        try {
            Class.forName("com.k2fsa.sherpa.onnx.KeywordSpotter");
            // The runtime is intentionally not activated until the model owner clears its license.
            runtimeStatus = Status.RUNTIME_MISSING;
        } catch (ClassNotFoundException error) {
            runtimeStatus = Status.RUNTIME_MISSING;
        }
        status = runtimeStatus;
    }

    Status getStatus() {
        return status;
    }

    boolean accept(short[] samples) {
        // Model assets are deliberately absent until their redistribution license is confirmed.
        return false;
    }

    private static Status validateManifest(AssetManager assets) {
        try (InputStream stream = assets.open(MANIFEST)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            for (int read = stream.read(buffer); read != -1; read = stream.read(buffer)) bytes.write(buffer, 0, read);
            JSONObject manifest = new JSONObject(new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8));
            if (!VERSION.equals(manifest.optString("sherpaVersion"))
                    || !MODEL_ID.equals(manifest.optString("modelId"))) {
                return Status.MODEL_INVALID;
            }
            JSONArray files = manifest.optJSONArray("files");
            if (files == null || files.length() < 6) return Status.MODEL_INVALID;
            for (int index = 0; index < files.length(); index++) {
                JSONObject file = files.optJSONObject(index);
                if (file == null || file.optString("path").isBlank() || file.optString("sha256").length() != 64) {
                    return Status.MODEL_INVALID;
                }
                try (InputStream ignored = assets.open("kws/" + file.getString("path"))) {
                    // Full SHA verification is performed by the packaging task once licensed assets exist.
                }
            }
            return Status.READY;
        } catch (IOException error) {
            return Status.MODEL_MISSING;
        } catch (Exception error) {
            return Status.MODEL_INVALID;
        }
    }

    @Override
    public void close() {}
}
