const { withMainApplication, withMainActivity } = require('expo/config-plugins');

function log(event) {
  return `android.util.Log.i("BusPereiraStartup", "[" + java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date()) + "] ${event} pid=" + android.os.Process.myPid() + " processElapsedMs=" + (android.os.SystemClock.elapsedRealtime() - android.os.Process.getStartElapsedRealtime()))`;
}
function application(source) {
  if (source.includes('// bus-pereira-native-startup')) return source;
  const anchor = 'class MainApplication : Application(), ReactApplication {';
  if (!source.includes(anchor)) throw new Error('Native startup logs: unexpected MainApplication template');
  return source.replace(anchor, `${anchor}
  // bus-pereira-native-startup
  override fun attachBaseContext(base: android.content.Context) {
    ${log('Application.attachBaseContext: inicio')}
    super.attachBaseContext(base)
    ${log('Application.attachBaseContext: fin')}
  }
`).replace('    super.onCreate()', `    ${log('Application.onCreate: inicio')}
    super.onCreate()`).replace('    ApplicationLifecycleDispatcher.onApplicationCreate(this)', `    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    ${log('Application.onCreate: fin')}`);
}
function activity(source) {
  if (source.includes('// bus-pereira-native-startup')) return source;
  const anchor = '  override fun onCreate(savedInstanceState: Bundle?) {';
  if (!source.includes(anchor)) throw new Error('Native startup logs: unexpected MainActivity template');
  return source.replace(anchor, `  // bus-pereira-native-startup
  override fun onResume() {
    super.onResume()
    ${log('Activity.onResume')}
  }

${anchor}
    ${log('Activity.onCreate: inicio')}`).replace('    super.onCreate(null)', `    super.onCreate(null)
    ${log('Activity.onCreate: fin')}
    window.decorView.viewTreeObserver.addOnDrawListener(object : android.view.ViewTreeObserver.OnDrawListener {
      private var recorded = false
      override fun onDraw() {
        if (recorded) return
        recorded = true
        ${log('Activity: primer onDraw (puede incluir splash)')}
        window.decorView.post { window.decorView.viewTreeObserver.removeOnDrawListener(this) }
      }
    })`);
}
module.exports = function withNativeStartupLogs(config) {
  config = withMainApplication(config, config => {
    if (config.modResults.language !== 'kt') throw new Error('Native startup logs require Kotlin');
    config.modResults.contents = application(config.modResults.contents);
    return config;
  });
  return withMainActivity(config, config => {
    if (config.modResults.language !== 'kt') throw new Error('Native startup logs require Kotlin');
    config.modResults.contents = activity(config.modResults.contents);
    return config;
  });
};
module.exports.application = application;
module.exports.activity = activity;
