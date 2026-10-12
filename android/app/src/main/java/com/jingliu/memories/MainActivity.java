package com.jingliu.memories;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
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
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net/";
    private static final int PICK_FILE = 10, SAVE_BACKUP = 11;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private boolean exporting;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(248, 246, 239));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(16, 29, 46));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new BackupBridge(), "JingliuAndroid");
        web.setWebViewClient(new LocalContentClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accepted = params.getAcceptTypes();
                boolean photo = false;
                for (String type : accepted) if (type.startsWith("image/")) photo = true;
                picker.setType(photo ? "image/*" : "*/*");
                if (photo) picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
                try { startActivityForResult(picker, PICK_FILE); }
                catch (ActivityNotFoundException error) { fileCallback.onReceiveValue(null); fileCallback = null; toast("这台设备暂时没有文件选择器。"); }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 33)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        web.loadUrl(ORIGIN);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPort() == -1;
    }

    private final class LocalContentClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!isLocal(uri) || !"GET".equals(request.getMethod())) return unavailable();
            String path = uri.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            if (path.contains("..") || path.contains("\\") || path.indexOf('\0') >= 0) return unavailable();
            String mime = "application/octet-stream";
            if (path.endsWith(".html")) mime = "text/html";
            else if (path.endsWith(".js")) mime = "application/javascript";
            else if (path.endsWith(".css")) mime = "text/css";
            else if (path.endsWith(".json")) mime = "application/json";
            else if (path.endsWith(".svg")) mime = "image/svg+xml";
            else if (path.endsWith(".jpg")) mime = "image/jpeg";
            else if (path.endsWith(".png")) mime = "image/png";
            else if (path.endsWith(".ttf")) mime = "font/ttf";
            else if (path.endsWith(".txt") || path.endsWith(".md")) mime = "text/plain";
            try {
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", assetHeaders(), getAssets().open("web" + path));
            } catch (IOException error) { return unavailable(); }
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (isLocal(request.getUrl())) return false;
            if (request.hasGesture() && request.isForMainFrame() && "https".equals(request.getUrl().getScheme())) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                catch (ActivityNotFoundException error) { toast("没有可打开此链接的浏览器。"); }
            }
            return true;
        }
    }

    private Map<String, String> assetHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("X-Content-Type-Options", "nosniff");
        return headers;
    }

    private WebResourceResponse unavailable() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    public final class BackupBridge {
        @JavascriptInterface public void exportBackup(String contents, String filename) {
            if (contents == null || contents.length() > 24 * 1024 * 1024 || filename == null) return;
            runOnUiThread(() -> {
                if (pendingBackup != null || exporting) { toast("请先完成上一份备份的保存。"); return; }
                pendingBackup = contents;
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.addCategory(Intent.CATEGORY_OPENABLE);
                save.setType("application/json");
                save.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[/\\\\]", "_") );
                try { startActivityForResult(save, SAVE_BACKUP); }
                catch (ActivityNotFoundException error) { pendingBackup = null; toast("这台设备暂时没有文件保存器。"); }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
            fileCallback = null;
        }
        if (request == SAVE_BACKUP) {
            String contents = pendingBackup;
            pendingBackup = null;
            if (result != RESULT_OK || data == null || data.getData() == null || contents == null) return;
            Uri destination = data.getData();
            exporting = true;
            new Thread(() -> {
                try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IOException("No output stream");
                    output.write(contents.getBytes(StandardCharsets.UTF_8));
                    output.flush();
                    toast("回忆备份已保存。");
                } catch (IOException | SecurityException error) { toast("备份未保存成功，请重新选择位置。"); }
                finally { runOnUiThread(() -> exporting = false); }
            }, "jingliu-backup").start();
        }
    }

    private void toast(String message) { runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }
    private void handleBack() {
        web.evaluateJavascript("Boolean(window.jingliuHandleBack && window.jingliuHandleBack())", handled -> { if (!"true".equals(handled)) finish(); });
    }
    // API 33+ uses the platform OnBackInvokedDispatcher registered in onCreate;
    // this override only serves Android 8-12, which still dispatch onBackPressed.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        web.removeJavascriptInterface("JingliuAndroid");
        web.destroy();
        super.onDestroy();
    }
}
