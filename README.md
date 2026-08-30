# System Call Mobile

Android-клиент System Call на React Native.

## Что нужно для локального запуска

- Node.js 22+
- npm
- JDK 17
- Android Studio
- Android SDK Platform 36
- Android SDK Build-Tools 36
- Android SDK Platform-Tools

## Настройка Android SDK на Windows

Обычно SDK находится здесь:

```text
C:\Users\<USER>\AppData\Local\Android\Sdk
```

Нужно добавить:

```text
ANDROID_HOME=C:\Users\<USER>\AppData\Local\Android\Sdk
```

И в `Path`:

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

Проверка:

```powershell
node --version
java -version
adb --version
```

## Локальный setup проекта

В корне проекта:

```powershell
npm ci
```

Если зависимости менялись и `package-lock.json` нужно обновить:

```powershell
npm install
```

## Запуск приложения локально

1. Подключить Android-устройство или запустить эмулятор.
2. Проверить, что устройство видно:

```powershell
adb devices
```

3. В первом терминале запустить Metro:

```powershell
npm start
```

4. Во втором терминале запустить Android-приложение:

```powershell
npm run android
```

Если устройство не достукивается до Metro:

```powershell
adb reverse tcp:8081 tcp:8081
```

## Полезные проверки перед работой

```powershell
npm run typecheck
npm test -- --runInBand
```

## Сборка debug APK

Из корня проекта:

```powershell
cd android
.\gradlew.bat assembleDebug
```

Готовый APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Установка на устройство:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Сборка release APK

Из корня проекта:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Готовый APK:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Важно про release

Сейчас `release`-сборка использует debug signing config. Это подходит для локальной проверки APK, но не для публикации в Google Play.

Для production позже нужно:

- отдельный release keystore
- release signing config в `android/app/build.gradle`
- безопасное хранение паролей и ключей

## Полезные команды

Полные Android-логи:

```powershell
adb logcat
```

Установка debug APK после ручной сборки:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Дополнительная документация

- [docs/ANDROID_DEVELOPMENT.md](docs/ANDROID_DEVELOPMENT.md)
- [android/NATIVE_SETUP.md](android/NATIVE_SETUP.md)
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)
