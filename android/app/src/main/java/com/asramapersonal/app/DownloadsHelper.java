package com.asramapersonal.app;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Menulis berkas ke folder Unduhan publik (MediaStore / legacy). */
public final class DownloadsHelper {

    private DownloadsHelper() {}

    public static String normalizeMimeType(String mimeType) {
        if (mimeType == null || mimeType.isEmpty()) {
            return "application/octet-stream";
        }
        int semi = mimeType.indexOf(';');
        return semi >= 0 ? mimeType.substring(0, semi).trim() : mimeType.trim();
    }

    public static Uri saveBytes(Context context, String filename, byte[] bytes, String mimeType)
            throws Exception {
        String safeMime = normalizeMimeType(mimeType);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri savedUri = context.getContentResolver().insert(collection, values);
            if (savedUri == null) {
                throw new Exception("Gagal membuat berkas di Unduhan");
            }

            try (OutputStream os = context.getContentResolver().openOutputStream(savedUri)) {
                if (os == null) {
                    throw new Exception("Gagal menulis berkas");
                }
                os.write(bytes);
            }
            return savedUri;
        }

        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir != null && !dir.exists()) {
            dir.mkdirs();
        }
        File outFile = new File(dir, filename);
        try (FileOutputStream fos = new FileOutputStream(outFile, false)) {
            fos.write(bytes);
        }
        return Uri.fromFile(outFile);
    }
}
