# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.poolpoker.app.* {
  native <methods>;
}

-keep class com.poolpoker.app.WryActivity {
  public <init>(...);

  void setWebView(com.poolpoker.app.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class com.poolpoker.app.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.poolpoker.app.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.poolpoker.app.RustWebChromeClient,com.poolpoker.app.RustWebViewClient {
  public <init>(...);
}
