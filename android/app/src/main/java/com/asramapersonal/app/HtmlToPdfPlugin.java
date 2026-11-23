package com.asramapersonal.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.util.DisplayMetrics;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "HtmlToPdf")
public class HtmlToPdfPlugin extends Plugin {

    private static final long RENDER_TIMEOUT_MS = 45_000L;
    private static final long LAYOUT_SETTLE_MS = 450L;
    private static final String HTML_BASE_URL = "https://localhost/";

    @PluginMethod
    public void fromHtml(PluginCall call) {
        String html = call.getString("html");
        String filename = call.getString("filename");
        boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        boolean openAfterSave = Boolean.TRUE.equals(call.getBoolean("openAfterSave", true));

        if (html == null || html.isEmpty() || filename == null || filename.isEmpty()) {
            call.reject("html dan filename wajib diisi");
            return;
        }

        if (!filename.toLowerCase().endsWith(".pdf")) {
            filename = filename + ".pdf";
        }

        final String outName = filename;
        final String htmlContent = html;

        android.app.Activity activity = getActivity();
        if (activity == null) {
            call.reject("Aktivitas tidak tersedia");
            return;
        }

        activity.runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            webView.getSettings().setJavaScriptEnabled(false);
            webView.getSettings().setDefaultTextEncodingName("utf-8");
            webView.getSettings().setLoadWithOverviewMode(true);
            webView.getSettings().setUseWideViewPort(true);

            final AtomicBoolean finished = new AtomicBoolean(false);

            final Runnable timeout = () -> {
                if (!finished.compareAndSet(false, true)) {
                    return;
                }
                try {
                    webView.destroy();
                } catch (Exception ignored) {
                }
                call.reject("Waktu habis saat membuat PDF");
            };

            final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
            handler.postDelayed(timeout, RENDER_TIMEOUT_MS);

            final Runnable renderTask = () -> {
                if (!finished.compareAndSet(false, true)) {
                    return;
                }
                handler.removeCallbacks(timeout);
                prepareWebViewForPrint(webView, landscape);
                renderPdf(webView, outName, landscape, openAfterSave, call);
            };

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    handler.removeCallbacks(renderTask);
                    handler.postDelayed(renderTask, LAYOUT_SETTLE_MS);
                }

                @Override
                public void onReceivedError(
                        WebView view,
                        int errorCode,
                        String description,
                        String failingUrl) {
                    if (!finished.compareAndSet(false, true)) {
                        return;
                    }
                    handler.removeCallbacks(timeout);
                    handler.removeCallbacks(renderTask);
                    try {
                        webView.destroy();
                    } catch (Exception ignored) {
                    }
                    call.reject(description != null ? description : "Gagal memuat HTML");
                }
            });

            webView.loadDataWithBaseURL(HTML_BASE_URL, htmlContent, "text/html", "UTF-8", null);
        });
    }

    /** Ukuran layout WebView mendekati lebar halaman A4 agar konten tidak kosong saat di-PDF-kan. */
    private void prepareWebViewForPrint(WebView webView, boolean landscape) {
        int pageWidthPt = landscape ? 842 : 595;
        DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        int widthPx = Math.max(1, (int) (pageWidthPt / 72f * dm.xdpi));
        webView.measure(
                View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        int h = Math.max(webView.getMeasuredHeight(), 1);
        webView.layout(0, 0, widthPx, h);
    }

    private void renderPdf(
            WebView webView,
            String filename,
            boolean landscape,
            boolean openAfterSave,
            PluginCall call) {
        PrintAttributes.MediaSize mediaSize = landscape
                ? PrintAttributes.MediaSize.ISO_A4.asLandscape()
                : PrintAttributes.MediaSize.ISO_A4;

        PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(mediaSize)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();

        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(filename);
        adapter.onStart();

        adapter.onLayout(
                null,
                attributes,
                null,
                new android.print.PdfLayoutResultCallback() {
                    @Override
                    public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                        File cacheFile;
                        ParcelFileDescriptor pfd;
                        try {
                            cacheFile = new File(
                                    getContext().getCacheDir(),
                                    "html-export-" + System.currentTimeMillis() + ".pdf");
                            pfd = ParcelFileDescriptor.open(
                                    cacheFile,
                                    ParcelFileDescriptor.MODE_CREATE
                                            | ParcelFileDescriptor.MODE_READ_WRITE
                                            | ParcelFileDescriptor.MODE_TRUNCATE);
                        } catch (IOException e) {
                            adapter.onFinish();
                            webView.destroy();
                            call.reject(e.getMessage() != null ? e.getMessage() : "Gagal menyiapkan PDF");
                            return;
                        }

                        adapter.onWrite(
                                new PageRange[] { PageRange.ALL_PAGES },
                                pfd,
                                null,
                                new android.print.PdfWriteResultCallback() {
                                    @Override
                                    public void onWriteFinished(PageRange[] pages) {
                                        adapter.onFinish();
                                        webView.destroy();
                                        try {
                                            pfd.close();
                                            if (pages == null || pages.length == 0) {
                                                cacheFile.delete();
                                                call.reject("PDF kosong — coba lagi");
                                                return;
                                            }
                                            byte[] bytes = readAllBytes(cacheFile);
                                            cacheFile.delete();
                                            if (bytes.length < 32) {
                                                call.reject("PDF kosong — coba lagi");
                                                return;
                                            }
                                            // Capgo/Capacitor Share hanya menerima file:// (bukan content://).
                                            // Salin ke cache agar bisa dibagikan via FileProvider.
                                            File shareFile = new File(
                                                    getContext().getCacheDir(),
                                                    "share-" + System.currentTimeMillis() + "-" + filename);
                                            try (FileOutputStream fos = new FileOutputStream(shareFile)) {
                                                fos.write(bytes);
                                            }
                                            Uri fileUri = Uri.fromFile(shareFile);

                                            Uri saved = DownloadsHelper.saveBytes(
                                                    getContext(),
                                                    filename,
                                                    bytes,
                                                    "application/pdf");
                                            if (openAfterSave) {
                                                openPdfWithViewer(saved);
                                            }
                                            JSObject ret = new JSObject();
                                            // file:// untuk Share; content/download tetap di unduhan.
                                            ret.put("uri", fileUri.toString());
                                            ret.put("downloadUri", saved != null ? saved.toString() : "");
                                            call.resolve(ret);
                                        } catch (Exception e) {
                                            call.reject(
                                                    e.getMessage() != null ? e.getMessage() : "Gagal menyimpan PDF",
                                                    e);
                                        }
                                    }

                                    @Override
                                    public void onWriteFailed(CharSequence error) {
                                        adapter.onFinish();
                                        webView.destroy();
                                        try {
                                            pfd.close();
                                        } catch (IOException ignored) {
                                        }
                                        cacheFile.delete();
                                        call.reject(error != null ? error.toString() : "Gagal menulis PDF");
                                    }
                                });
                    }

                    @Override
                    public void onLayoutFailed(CharSequence error) {
                        adapter.onFinish();
                        webView.destroy();
                        call.reject(error != null ? error.toString() : "Gagal layout PDF");
                    }
                },
                null);
    }

    private void openPdfWithViewer(Uri uri) {
        android.app.Activity activity = getActivity();
        if (activity == null || uri == null) {
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/pdf");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(Intent.createChooser(intent, "Buka PDF"));
        } catch (ActivityNotFoundException ignored) {
            // Tidak ada aplikasi pembaca PDF — file tetap ada di Unduhan.
        }
    }

    private static byte[] readAllBytes(File file) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            long len = file.length();
            if (len > Integer.MAX_VALUE) {
                throw new IOException("PDF terlalu besar");
            }
            byte[] data = new byte[(int) len];
            int read = 0;
            while (read < data.length) {
                int n = in.read(data, read, data.length - read);
                if (n < 0) {
                    break;
                }
                read += n;
            }
            if (read != data.length) {
                throw new IOException("Gagal membaca PDF");
            }
            return data;
        }
    }
}
