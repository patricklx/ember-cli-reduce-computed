import Ember from 'ember';
var propertyWillChange = Ember.propertyWillChange;
var propertyDidChange = Ember.propertyDidChange;
var run = Ember.run;
var metaFor = Ember.meta;

function ReduceComputedPropertyInstanceMeta(context, propertyName) {
  this.context = context;
  this.propertyName = propertyName;
  this.dependentArrays = {};
  this.sugarMeta = {};
  this.initialValue = undefined;
  this.value = undefined;
  this.valueChanged = false;
  this.update = null;
  var contextMeta = metaFor(context);
  var contextCache = contextMeta.cache;
  if (!contextCache) { contextCache = contextMeta.cache = {}; }
  this.cache = contextCache;
}

ReduceComputedPropertyInstanceMeta.prototype = {

  shouldRecompute: function () {
    return this.value === undefined;
  },

  forceFlush: function () {
    if (this.update) {
      run.cancel(this.update);
      this.dependentArraysObserver._flushChanges();
    }
  },

  notifyPropertyChangeIfRequired: function () {
    var didChange = this.valueChanged;
    if (didChange){
      this.valueChanged = false;
      propertyWillChange(this.context, this.propertyName);
      propertyDidChange(this.context, this.propertyName);
    }
  },

  getValue: function () {

    this.forceFlush();

    var value = this.value;

    if (value !== undefined) {
      return value;
    } else {
      return this.initialValue;
    }
  },

  setValue: function(newValue) {
    // This lets sugars force a recomputation, handy for very simple
    // implementations of eg max.
    if (newValue === this.value) {
      return;
    }

    this.value = newValue;
    this.valueChanged = true;
  }
};

export default ReduceComputedPropertyInstanceMeta;
