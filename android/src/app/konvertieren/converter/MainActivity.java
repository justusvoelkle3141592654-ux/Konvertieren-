package app.konvertieren.converter;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * Lädt die gebündelte Web-App (assets/index.html) in eine WebView und
 * verbindet sie mit Android: Datei-Auswahl beim Upload und ein
 * "Speichern unter"-Dialog (Storage Access Framework) für das Ergebnis.
 */
public class MainActivity extends Activity {

    private static final int REQ_PICK_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    private WebView webView;
    private ValueCallback<Uri[]> pendingUpload;
    private byte[] pendingSaveData;
    private String pendingSaveName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);

        webView.addJavascriptInterface(new JsBridge(), "Android");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingUpload != null) {
                    pendingUpload.onReceiveValue(null);
                }
                pendingUpload = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Datei auswählen"),
                            REQ_PICK_FILE);
                } catch (Exception e) {
                    pendingUpload = null;
                    callback.onReceiveValue(null);
                    showToast("Es konnte kein Datei-Manager geöffnet werden.");
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    /** Von JavaScript aus aufrufbar: window.Android.saveFile(...) */
    private class JsBridge {
        @JavascriptInterface
        public void saveFile(String base64, String fileName, String mimeType) {
            try {
                pendingSaveData = Base64.decode(base64, Base64.DEFAULT);
                pendingSaveName = fileName;
            } catch (Exception e) {
                showToast("Datei konnte nicht dekodiert werden.");
                return;
            }
            final Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mimeType == null || mimeType.isEmpty()
                    ? "application/octet-stream" : mimeType);
            intent.putExtra(Intent.EXTRA_TITLE, fileName);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivityForResult(intent, REQ_SAVE_FILE);
                    } catch (Exception e) {
                        showToast("Speichern-Dialog konnte nicht geöffnet werden.");
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_PICK_FILE) {
            if (pendingUpload != null) {
                pendingUpload.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                pendingUpload = null;
            }
            return;
        }

        if (requestCode == REQ_SAVE_FILE) {
            byte[] bytes = pendingSaveData;
            String name = pendingSaveName;
            pendingSaveData = null;
            pendingSaveName = null;

            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                return; // Nutzer hat abgebrochen
            }
            if (bytes == null) {
                showToast("Keine Daten zum Speichern vorhanden.");
                return;
            }
            OutputStream out = null;
            try {
                out = getContentResolver().openOutputStream(data.getData());
                out.write(bytes);
                out.flush();
                showToast("Gespeichert: " + name);
            } catch (Exception e) {
                showToast("Speichern fehlgeschlagen: " + e.getMessage());
            } finally {
                if (out != null) {
                    try {
                        out.close();
                    } catch (Exception ignored) {
                    }
                }
            }
        }
    }

    private void showToast(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
