import { bootstrapApplication } from '@angular/platform-browser';
import * as amplitude from '@amplitude/unified';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

amplitude.initAll(environment.amplitudeApiKey, { analytics: { autocapture: true }, sessionReplay: { sampleRate: 1 } });
amplitude.track('Viewed Home Page', { prompt_version: 'BA400.4' }); // helps improve this setup flow — safe to remove once you've verified the event lands

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
