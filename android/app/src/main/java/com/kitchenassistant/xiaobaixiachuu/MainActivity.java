package com.kitchenassistant.xiaobaixiachuu;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.kitchenassistant.xiaobaixiachuu.voice.XiaobaiVoicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(XiaobaiVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
