package com.asramapersonal.app;

import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SaveToDownloads")
public class SaveToDownloadsPlugin extends Plugin {

    @PluginMethod
    public void saveBase64(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (filename == null || filename.isEmpty() || data == null) {
            call.reject("filename dan data wajib diisi");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            Uri savedUri = DownloadsHelper.saveBytes(getContext(), filename, bytes, mimeType);

            JSObject ret = new JSObject();
            ret.put("uri", savedUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Gagal menyimpan", e);
        }
    }
}
