import Ember from 'ember';
var propertyWillChange = Ember.propertyWillChange;
var propertyDidChange = Ember.propertyDidChange;
var run = Ember.run;

function ReduceComputedPropertyInstanceMeta(context, propertyName) {
  this.context = context;
  this.propertyName = propertyName;
  this.dependentArrays = {};
  this.sugarMeta = {};
  this.initialValue = undefined;
}

ReduceComputedPropertyInstanceMeta.prototype = {
  value: undefined,
  valueChanged: false,

  shouldRecompute: function () {
    return this.value === undefined;
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
    if (this.dependentArraysObserver.update) {
      run.cancel(this.dependentArraysObserver.update);
      this.dependentArraysObserver._flushChanges();
    }
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
