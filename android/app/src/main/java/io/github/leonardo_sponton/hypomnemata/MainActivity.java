package io.github.leonardo_sponton.hypomnemata;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HypoFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
