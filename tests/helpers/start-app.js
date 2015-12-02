import Ember from 'ember';
import Application from '../../app';
import config from '../../config/environment';
import AssertionAssert from '../helpers/assertion';

export default function startApp(attrs) {
  let application;

  let attributes = Ember.merge({}, config.APP);
  attributes = Ember.merge(attributes, attrs); // use defaults, but you can override;
  let aa = new AssertionAssert({
    Ember: Ember
  });
  aa.inject();

  Ember.run(() => {
    application = Application.create(attributes);
    application.setupForTesting();
    application.injectTestHelpers();
  });

  return application;
}
