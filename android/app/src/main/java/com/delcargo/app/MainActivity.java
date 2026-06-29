package com.delcargo.app;

import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onStart() {
    super.onStart();
    // Enable hardware acceleration for smooth camera rendering
    WebView webView = getBridge().getWebView();
    webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
    webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

    // Grant camera/microphone permissions to WebView JS (getUserMedia)
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(() -> request.grant(request.getResources()));
      }
    });
  }
}
