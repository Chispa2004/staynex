import { BasePmsConnector } from '../base-pms-connector.js';

export class CloudbedsPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'cloudbeds' });
  }
}
