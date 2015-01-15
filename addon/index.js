import Ember from 'ember';
import {arrayComputed, ArrayComputedProperty} from './reduced-computed/array_computed';
import {reduceComputed} from './reduced-computed/reduce_computed';

var install = function () {
  Ember.reduceComputed = reduceComputed;
  Ember.arrayComputed = arrayComputed;
};

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
