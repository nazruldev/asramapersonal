package com.asramapersonal.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveToDownloadsPlugin.class);
        registerPlugin(HtmlToPdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
