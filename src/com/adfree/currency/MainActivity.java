package com.adfree.currency;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.net.Uri;
import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import java.net.*;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.util.concurrent.*;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private volatile boolean destroyed;
    private static final String ORIGIN = "https://app.fx.local/";

    @Override public void onCreate(Bundle state) {
        String startupTheme = getSharedPreferences("appearance", MODE_PRIVATE).getString("theme", "light");
        setTheme(getResources().getIdentifier("light".equals(startupTheme) ? "AppThemeLight" : "AppTheme", "style", getPackageName()));
        super.onCreate(state);
        web = new WebView(this);
        applyAppearance(startupTheme);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new NetworkBridge(), "AndroidFX");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !"app.fx.local".equals(uri.getHost())) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
                }
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (!path.matches("/[A-Za-z0-9_.-]+")) return null;
                try {
                    String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "application/json";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring(1)));
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ORIGIN)) return false;
                if (url.equals("https://frankfurter.dev/") || url.equals("https://finance.yahoo.com/currencies/")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl(ORIGIN);
    }
    private void applyAppearance(String mode) {
        boolean light = "light".equals(mode);
        setTheme(getResources().getIdentifier(light ? "AppThemeLight" : "AppTheme", "style", getPackageName()));
        int background = light ? 0xfff5f8f5 : 0xff0a161b;
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        int lightFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(light ? flags | lightFlags : flags & ~lightFlags);
        if (web != null) web.setBackgroundColor(background);
    }
    private boolean allowed(URL url) {
        if (!url.getProtocol().equals("https") || url.getUserInfo() != null || (url.getPort() != -1 && url.getPort() != 443)) return false;
        String host = url.getHost(), path = url.getPath();
        if (host.equals("api.frankfurter.dev")) return path.equals("/v2/currencies") || path.equals("/v2/rates") || path.matches("/v2/rate/[A-Z]{3}/[A-Z]{3}");
        if (host.equals("query1.finance.yahoo.com") || host.equals("query2.finance.yahoo.com")) return path.matches("/v8/finance/chart/[A-Z]{3,6}(=|%3D)X");
        return false;
    }
    private void reply(final String id, final String data, final String error) {
        runOnUiThread(new Runnable() { public void run() {
            if (!destroyed) web.evaluateJavascript("window.__nativeReply(" + JSONObject.quote(id) + "," + (data == null ? "null" : JSONObject.quote(data)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")", null);
        }});
    }
    public class NetworkBridge {
        @JavascriptInterface public String getAppearance() {
            return getSharedPreferences("appearance", MODE_PRIVATE).getString("theme", "light");
        }
        @JavascriptInterface public void setAppearance(final String mode) {
            if (!("light".equals(mode) || "dark".equals(mode)) || destroyed) return;
            getSharedPreferences("appearance", MODE_PRIVATE).edit().putString("theme", mode).apply();
            runOnUiThread(new Runnable() { public void run() { if (!destroyed) applyAppearance(mode); }});
        }
        @JavascriptInterface public void request(final String id, final String address) {
            if (!id.matches("r[0-9]+") || address.length() > 1500 || destroyed) return;
            pool.execute(new Runnable() { public void run() {
                HttpsURLConnection connection = null;
                try {
                    URL url = new URL(address);
                    if (!allowed(url)) throw new IOException("不支持的数据地址");
                    connection = (HttpsURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(12000);
                    connection.setReadTimeout(15000);
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) FXPocket/1.0");
                    connection.setRequestProperty("Accept", "application/json");
                    int status = connection.getResponseCode();
                    if (status != 200) throw new IOException(status == 429 ? "请求过于频繁，请稍后刷新" : "数据源暂不可用 (" + status + ")");
                    ByteArrayOutputStream body = new ByteArrayOutputStream();
                    try (InputStream stream = connection.getInputStream()) {
                        byte[] buffer = new byte[8192]; int size;
                        while ((size = stream.read(buffer)) != -1) {
                            if (body.size() + size > 4000000) throw new IOException("数据超出大小限制");
                            body.write(buffer, 0, size);
                        }
                    }
                    reply(id, body.toString("UTF-8"), null);
                } catch (Exception e) { reply(id, null, e.getMessage() == null ? "网络请求失败" : e.getMessage()); }
                finally { if (connection != null) connection.disconnect(); }
            }});
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleBack ? window.handleBack() : false", new ValueCallback<String>() {
            public void onReceiveValue(String result) { if (!"true".equals(result)) MainActivity.super.onBackPressed(); }
        });
    }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { destroyed = true; pool.shutdownNow(); web.removeJavascriptInterface("AndroidFX"); web.destroy(); super.onDestroy(); }
}
