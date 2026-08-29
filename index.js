/*
 * Hermes in the RN 0.81 legacy architecture does not expose WeakRef.
 * Some LiveKit dependencies reference it during module initialization.
 * This compatibility shim intentionally keeps a strong reference; for the
 * mobile runtime that is preferable to crashing before a room can mount.
 */
if (typeof global.WeakRef === 'undefined') {
  global.WeakRef = class WeakRef {
    constructor(value) {
      this.value = value;
    }

    deref() {
      return this.value;
    }
  };
}

if (typeof global.FinalizationRegistry === 'undefined') {
  global.FinalizationRegistry = class FinalizationRegistry {
    register() {}
    unregister() {
      return false;
    }
  };
}

const {AppRegistry} = require('react-native');
const {registerGlobals} = require('@livekit/react-native');
const App = require('./src/App').default;
const {name: appName} = require('./app.json');

registerGlobals();
AppRegistry.registerComponent(appName, () => App);
