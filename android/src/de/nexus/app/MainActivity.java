package de.nexus.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Nexus — schlanker WebView-Container für die Web-App in assets/.
 *
 * Die App wird über eine virtuelle https-Adresse ausgeliefert (Anfragen an
 * APP_HOST werden abgefangen und aus assets/ beantwortet). Dadurch hat die
 * Seite einen echten https-Ursprung — Voraussetzung dafür, dass YouTube-
 * Embeds einen gültigen Referer erhalten (sonst "Fehler 153") und dass
 * Web-APIs wie crypto.subtle verfügbar sind. Externe Links öffnen im
 * Browser, Videos laufen im eingebetteten Player inklusive Vollbild.
 */
public class MainActivity extends Activity {

    /** Reservierte Domain für WebView-Assets — wird nie ins Netz aufgelöst. */
    private static final String APP_HOST = "appassets.androidx.dev";
    private static final String START_URL = "https://" + APP_HOST + "/assets/index.html";

    private static final int REQ_PICK_FILE = 1001;
    private static final int REQ_SAVE_FILE = 1002;

    private WebView webView;
    private FrameLayout rootLayout;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    // Datei-Upload (WebView-FileChooser) und Speichern (JS-Bridge)
    private ValueCallback<Uri[]> filePathCallback;
    private byte[] pendingSaveBytes;
    private String pendingSaveName;

    // Offline-Videos (privater App-Speicher)
    private final Map<Long, String> offlineDownloads = new HashMap<>();
    private BroadcastReceiver downloadReceiver;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!APP_HOST.equals(url.getHost())) return null;
                String path = url.getPath() == null ? "" : url.getPath();
                if (path.startsWith("/assets/") && !path.contains("..")) {
                    String name = path.substring("/assets/".length());
                    try {
                        InputStream in = getAssets().open(name);
                        return new WebResourceResponse(mimeFor(name), "utf-8", in);
                    } catch (IOException ignored) {
                    }
                }
                // Offline gespeicherte Videos aus dem privaten App-Speicher ausliefern
                if (path.startsWith("/offline/") && !path.contains("..")) {
                    String fn = Uri.decode(path.substring("/offline/".length()));
                    File f = new File(getOfflineDir(), fn);
                    if (f.exists()) {
                        String rangeHeader = request.getRequestHeaders() != null
                                ? request.getRequestHeaders().get("Range") : null;
                        WebResourceResponse r = buildFileResponse(f, rangeHeader, mimeFor(fn));
                        if (r != null) return r;
                    }
                }
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                        Collections.<String, String>emptyMap(),
                        new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri url = request.getUrl();
                if (APP_HOST.equals(url.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                webView.setVisibility(View.GONE);
                rootLayout.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                setSystemUiForFullscreen(true);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                rootLayout.removeView(fullscreenView);
                fullscreenView = null;
                if (fullscreenCallback != null) {
                    fullscreenCallback.onCustomViewHidden();
                    fullscreenCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
                setSystemUiForFullscreen(false);
            }

            // Datei-Auswahl für <input type="file"> (auch aus dem Konverter-iframe)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*");
                }
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (intent.getType() == null) intent.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Datei auswählen"), REQ_PICK_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    toast("Kein Dateimanager gefunden.");
                    return false;
                }
                return true;
            }
        });

        // Speicher-Bridge, die der Konverter erwartet: window.Android.saveFile(...)
        webView.addJavascriptInterface(new NativeBridge(), "Android");

        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootLayout);

        Window window = getWindow();
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);

        registerDownloadReceiver();
        webView.loadUrl(START_URL);
    }

    private void registerDownloadReceiver() {
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                String videoId = offlineDownloads.remove(id);
                if (videoId == null) return;
                boolean ok = false;
                try {
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    Cursor c = dm.query(new DownloadManager.Query().setFilterById(id));
                    if (c != null && c.moveToFirst()) {
                        int idx = c.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        ok = idx >= 0 && c.getInt(idx) == DownloadManager.STATUS_SUCCESSFUL;
                    }
                    if (c != null) c.close();
                } catch (Exception ignored) {}
                final boolean success = ok;
                final String vid = videoId.replace("'", "");
                webView.post(new Runnable() {
                    public void run() {
                        webView.evaluateJavascript(
                            "window.NexusOffline&&window.NexusOffline.onComplete('" + vid + "'," + success + ")", null);
                    }
                });
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, filter);
        }
    }

    /** Von der Web-App (Konverter) aufgerufen, um eine Datei zu speichern. */
    private class NativeBridge {
        @JavascriptInterface
        public void saveFile(final String base64, final String name, final String mime) {
            final byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (Exception e) {
                runOnUiThread(new Runnable() {
                    public void run() { toast("Datei konnte nicht gelesen werden."); }
                });
                return;
            }
            final byte[] bytes = data;
            runOnUiThread(new Runnable() {
                public void run() { startSaveDocument(bytes, name, mime); }
            });
        }

        /** Video offline (nur in der App) speichern — privater App-Speicher. */
        @JavascriptInterface
        public void saveOffline(final String url, final String videoId,
                                final String filename, final String mime) {
            runOnUiThread(new Runnable() {
                public void run() { enqueueOffline(url, videoId, filename, mime); }
            });
        }

        /** Ein offline gespeichertes Video wieder löschen. */
        @JavascriptInterface
        public void deleteOffline(final String filename) {
            try {
                File f = new File(getOfflineDir(), filename);
                if (f.exists()) f.delete();
            } catch (Exception ignored) {}
        }
    }

    private File getOfflineDir() {
        File base = getExternalFilesDir(null);
        if (base == null) base = getFilesDir();
        File dir = new File(base, "offline");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private void enqueueOffline(String url, String videoId, String filename, String mime) {
        try {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                notifyOfflineFailed(videoId);
                return;
            }
            if (getExternalFilesDir(null) == null) {
                toast("Kein Speicher verfügbar.");
                notifyOfflineFailed(videoId);
                return;
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle(filename != null ? filename : "Video");
            req.setDescription("Nexus – offline speichern");
            if (mime != null && !mime.isEmpty()) req.setMimeType(mime);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            // Privater App-Ordner: nicht in Galerie/Downloads sichtbar
            req.setDestinationInExternalFilesDir(this, null, "offline/" + filename);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) { toast("Speichern nicht verfügbar."); notifyOfflineFailed(videoId); return; }
            long id = dm.enqueue(req);
            offlineDownloads.put(id, videoId);
        } catch (Exception e) {
            toast("Offline-Speichern fehlgeschlagen.");
            notifyOfflineFailed(videoId);
        }
    }

    private void notifyOfflineFailed(String videoId) {
        if (videoId == null) return;
        final String vid = videoId.replace("'", "");
        webView.post(new Runnable() {
            public void run() {
                webView.evaluateJavascript(
                    "window.NexusOffline&&window.NexusOffline.onComplete('" + vid + "',false)", null);
            }
        });
    }

    /** Liefert eine lokale Datei aus, mit HTTP-Range-Unterstützung fürs Video-Seeking. */
    private WebResourceResponse buildFileResponse(File f, String range, String mime) {
        try {
            long len = f.length();
            long start = 0, end = len - 1;
            int status = 200;
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-store");
            if (range != null && range.startsWith("bytes=")) {
                try {
                    String[] parts = range.substring(6).split("-", 2);
                    start = Long.parseLong(parts[0].trim());
                    if (parts.length > 1 && !parts[1].trim().isEmpty()) {
                        end = Long.parseLong(parts[1].trim());
                    }
                    if (end >= len) end = len - 1;
                    if (start > end) { start = 0; end = len - 1; }
                    status = 206;
                    headers.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
                } catch (NumberFormatException nfe) {
                    start = 0; end = len - 1; status = 200;
                }
            }
            long count = end - start + 1;
            FileInputStream fis = new FileInputStream(f);
            long skipped = 0;
            while (skipped < start) {
                long s = fis.skip(start - skipped);
                if (s <= 0) break;
                skipped += s;
            }
            headers.put("Content-Length", String.valueOf(count));
            WebResourceResponse resp = new WebResourceResponse(mime, null,
                    new LimitedInputStream(fis, count));
            resp.setStatusCodeAndReasonPhrase(status, status == 206 ? "Partial Content" : "OK");
            resp.setResponseHeaders(headers);
            return resp;
        } catch (Exception e) {
            return null;
        }
    }

    /** Begrenzt einen Stream auf eine feste Byte-Anzahl (für Range-Antworten). */
    private static class LimitedInputStream extends InputStream {
        private final InputStream in;
        private long remaining;

        LimitedInputStream(InputStream in, long limit) { this.in = in; this.remaining = limit; }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = in.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int n = in.read(b, off, toRead);
            if (n > 0) remaining -= n;
            return n;
        }

        @Override
        public void close() throws IOException { in.close(); }
    }

    private void startSaveDocument(byte[] data, String name, String mime) {
        pendingSaveBytes = data;
        pendingSaveName = name;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime != null && !mime.isEmpty() ? mime : "application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, name != null ? name : "datei");
        try {
            startActivityForResult(intent, REQ_SAVE_FILE);
        } catch (Exception e) {
            pendingSaveBytes = null;
            toast("Speichern nicht möglich.");
        }
    }

    private void writeToUri(Uri uri, byte[] data) {
        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
            if (os == null) throw new IOException("kein Stream");
            os.write(data);
            os.flush();
            toast("Gespeichert ✓");
        } catch (Exception e) {
            toast("Speichern fehlgeschlagen.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    results = new Uri[n];
                    for (int i = 0; i < n; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{ data.getData() };
                }
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null
                    && pendingSaveBytes != null) {
                writeToUri(data.getData(), pendingSaveBytes);
            }
            pendingSaveBytes = null;
            pendingSaveName = null;
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private static String mimeFor(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".js")) return "text/javascript";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".webmanifest") || name.endsWith(".json")) return "application/manifest+json";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".mp4")) return "video/mp4";
        if (name.endsWith(".webm")) return "video/webm";
        if (name.endsWith(".m4a")) return "audio/mp4";
        if (name.endsWith(".opus")) return "audio/ogg";
        return "application/octet-stream";
    }

    private void setSystemUiForFullscreen(boolean fullscreen) {
        View decor = getWindow().getDecorView();
        if (fullscreen) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            webView.getWebChromeClient();
            // Vollbild-Video zuerst schließen
            rootLayout.removeView(fullscreenView);
            fullscreenView = null;
            if (fullscreenCallback != null) {
                fullscreenCallback.onCustomViewHidden();
                fullscreenCallback = null;
            }
            webView.setVisibility(View.VISIBLE);
            setSystemUiForFullscreen(false);
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (downloadReceiver != null) {
            try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
        }
        webView.destroy();
        super.onDestroy();
    }
}
