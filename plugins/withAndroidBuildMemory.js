const { withGradleProperties } = require('expo/config-plugins');

// Keep the release-build memory settings when Expo regenerates android/.
module.exports = function withAndroidBuildMemory(config) {
  return withGradleProperties(config, (config) => {
    const properties = {
      'org.gradle.jvmargs':
        '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError',
      'org.gradle.parallel': 'false',
      'org.gradle.workers.max': '2',
    };

    config.modResults = config.modResults.filter(
      (entry) => entry.type !== 'property' || !(entry.key in properties)
    );
    for (const [key, value] of Object.entries(properties)) {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
};
