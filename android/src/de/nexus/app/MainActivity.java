package de.nexus.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
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

    private WebView webView;
    private FrameLayout rootLayout;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

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
        });

        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootLayout);

        Window window = getWindow();
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);

        webView.loadUrl(START_URL);
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
