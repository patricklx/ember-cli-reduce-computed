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

    return this.value;
  },

  setValue: function(newValue, force) {

    if (!force && (newValue === this.value || this.value === undefined)) {
      return;
    }

    this.value = newValue;
    this.valueChanged = true;
  },

  setInitialValue: function(newValue){
    if (newValue === this.value){
      return;
    }
    this.value = newValue;
    this.valueChanged = true;
  }
};

export default ReduceComputedPropertyInstanceMeta;
