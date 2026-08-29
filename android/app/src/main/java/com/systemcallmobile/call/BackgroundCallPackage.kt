package com.systemcallmobile.call
import com.facebook.react.ReactPackage;import com.facebook.react.bridge.*;import com.facebook.react.uimanager.ViewManager
class BackgroundCallPackage:ReactPackage{override fun createNativeModules(reactContext:ReactApplicationContext):List<NativeModule> = listOf(BackgroundCallModule(reactContext));override fun createViewManagers(reactContext:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()}
