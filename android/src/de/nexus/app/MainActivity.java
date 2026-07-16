package de.nexus.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
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
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;

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

        webView.loadUrl(START_URL);
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
        webView.destroy();
        super.onDestroy();
    }
}
