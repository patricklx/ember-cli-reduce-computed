import Ember from 'ember';
import {arrayComputed, ArrayComputedProperty} from './reduced-computed/array_computed';
import {reduceComputed} from './reduced-computed/reduce_computed';

var install = function () {
  Ember.reduceComputed = reduceComputed;
  Ember.arrayComputed = arrayComputed;
};


if (Ember.libraries) {
  Ember.libraries.register('ember-cli-reduce-computed', '0.1.0');
}

export {
  reduceComputed,
  arrayComputed,
  install
};

export default {
  reduceComputed: reduceComputed,
  arrayComputed: arrayComputed,
  ArrayComputedProperty: ArrayComputedProperty,
  install: install
};
