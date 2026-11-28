package se.mediahub.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String MEDIAHUB_HOST = "media.emmyzettergren.se";
    private static final String START_URL = "https://" + MEDIAHUB_HOST + "/tv";
    private WebView webView;

    @Override
    public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && openNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openNavigation(Uri.parse(url));
            }
        });
        setContentView(webView);
        webView.requestFocus();
        if (savedState == null || webView.restoreState(savedState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    private boolean openNavigation(Uri uri) {
        if (!"https".equals(uri.getScheme())) return true;
        if (MEDIAHUB_HOST.equalsIgnoreCase(uri.getHost()) && uri.getPort() == -1) return false;

        if ("www.netflix.com".equalsIgnoreCase(uri.getHost()) && uri.getPort() == -1 &&
                uri.getPath() != null && uri.getPath().matches("/title/[0-9]+")) {
            String titleId = uri.getLastPathSegment();
            Uri appLink = Uri.parse("nflx://www.netflix.com/watch/" + titleId);
            if (!launchNetflix(uri) && !launchNetflix(appLink)) {
                Toast.makeText(this, "Netflix could not open this title on this TV.", Toast.LENGTH_LONG).show();
            }
        }
        return true;
    }

    private boolean launchNetflix(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).setPackage("com.netflix.ninja"));
            return true;
        } catch (ActivityNotFoundException ignored) {
            return false;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
