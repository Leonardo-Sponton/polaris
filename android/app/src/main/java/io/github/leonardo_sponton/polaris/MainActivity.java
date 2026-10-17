package io.github.leonardo_sponton.polaris;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PolarisFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
