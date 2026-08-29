# SystemCall Mobile — запуск на Android

Эта инструкция рассчитана на Windows и физический Android-телефон.

## 1. Что установить

Нужно установить:

- Node.js 20+
- Git
- Android Studio
- JDK 17 (можно использовать JDK, поставляемый с Android Studio)

В Android Studio открой **SDK Manager** и установи Android SDK Platform 36, Android SDK Build-Tools 36 и Android SDK Platform-Tools.

## 2. Переменные окружения Windows

Обычно Android SDK находится здесь:

```text
C:\Users\<USER>\AppData\Local\Android\Sdk
```

Создай переменную:

```text
ANDROID_HOME=C:\Users\<USER>\AppData\Local\Android\Sdk
```

Добавь в `Path`:

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

Убедись, что команды работают:

```powershell
node --version
java -version
adb --version
```

## 3. Установка зависимостей проекта

В корне `systemcall-mobile`:

```powershell
npm ci
```

Если `package-lock.json` был намеренно изменён вместе с зависимостями, используй `npm install`, после чего закоммить обновлённый lock-файл.

## 4. Один раз скачать Gradle Wrapper JAR

Бинарный `gradle-wrapper.jar` намеренно не хранится в репозитории. Выполни из корня проекта:

```powershell
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/react-native-community/template/0.81.1/template/android/gradle/wrapper/gradle-wrapper.jar" `
  -OutFile "android/gradle/wrapper/gradle-wrapper.jar"
```

После этого работает `android\gradlew.bat`.

## 5. Подготовить телефон

На Android включи режим разработчика: **Настройки → О телефоне → несколько раз нажать по номеру сборки**.

Затем включи **USB debugging / Отладка по USB**, подключи телефон кабелем и подтверди RSA-разрешение на телефоне.

Проверь:

```powershell
adb devices
```

Ожидается примерно:

```text
List of devices attached
R58M123456A    device
```

Если написано `unauthorized`, разблокируй телефон и подтверди разрешение отладки.

## 6. Запуск приложения на телефоне

Первый терминал в корне проекта:

```powershell
npm start
```

Metro должен остаться запущенным.

Во втором терминале:

```powershell
npm run android
```

React Native соберёт debug-приложение, установит его на подключённый телефон и запустит SystemCall.

Если телефон не может подключиться к Metro, выполни:

```powershell
adb reverse tcp:8081 tcp:8081
```

и перезапусти приложение.

## 7. Логи

Полные Android-логи:

```powershell
adb logcat
```

React Native CLI также показывает JS-логи в терминале с Metro.

## 8. Собрать debug APK вручную

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK появится здесь:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Установить его вручную:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 9. Автоматическая сборка APK в GitHub Actions

Workflow `.github/workflows/build-android-apk.yml` запускается при каждом push в ветку `build-app`, а также вручную через **Actions → Build Android APK → Run workflow**.

Рекомендуемый процесс:

```powershell
git switch build-app
git merge main
git push origin build-app
```

После успешной сборки открой GitHub → **Actions → Build Android APK → последний run → Artifacts** и скачай архив `systemcall-mobile-debug-<commit>`.

Внутри будет `app-debug.apk`, который можно установить на Android.

Artifact хранится 14 дней.

> Это debug APK для разработки и тестирования. Для Google Play / production позже нужно сделать отдельный release workflow, собственный signing keystore и безопасно хранить signing credentials в GitHub Secrets.

## 10. Быстрый ежедневный цикл разработки

Обычно после первоначальной настройки достаточно:

```powershell
git pull
npm ci
adb devices
npm start
```

Во втором терминале:

```powershell
npm run android
```

При изменениях JS/TS Metro обновляет приложение без полной пересборки APK. Полная Gradle-сборка нужна после изменений native Android-кода или native-зависимостей.

## 11. Перед push

```powershell
npm run typecheck
npm test
npm run format:check
```

## 12. Что проверяем первым

Для первого MVP-теста достаточно:

1. SystemCall запускается на физическом телефоне.
2. Приложение не падает при старте.
3. API доступен с телефона.
4. Можно вставить ссылку публичной комнаты.
5. Приложение получает комнату с backend API.

После этого можно переходить к реальному camera preview, runtime permissions и звонку через LiveKit.
