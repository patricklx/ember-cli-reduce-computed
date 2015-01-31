import Ember from 'ember';
var get = Ember.get;
var guidFor = Ember.guidFor;
var addObserver = Ember.addObserver;
var removeObserver = Ember.removeObserver;
var forEach = Ember.EnumerableUtils.forEach;
var run = Ember.run;
var cacheFor = Ember.cacheFor;
var cacheRemove = cacheFor.remove;
var metaFor = Ember.meta;

function ItemPropertyObserverContext (dependentArray, index) {
  this.dependentArray = dependentArray;
  this.index = index;
  this.item = dependentArray.objectAt(index);
  this.observer = null;
}


function ChangeMeta(dependentArray, item, index, propertyName, property, changedCount){
  this.arrayChanged = dependentArray;
  this.index = index;
  this.item = item;
  this.propertyName = propertyName;
  this.property = property;
  this.changedCount = changedCount;
}

/*
 Tracks changes to dependent arrays, as well as to properties of items in
 dependent arrays.

 @class DependentArraysObserver
 */
function DependentArraysObserver(callbacks, cp, instanceMeta, context, propertyName, sugarMeta) {
  // user specified callbacks for `addedItem` and `removedItem`
  this.callbacks = callbacks;

  this.cache = metaFor(context).cache;
  this.propertyName = propertyName;

  // the computed property: remember these are shared across instances
  this.cp = cp;
  this.needIndex = cp.options.needIndex;

  // the ReduceComputedPropertyInstanceMeta this DependentArraysObserver is
  // associated with
  this.instanceMeta = instanceMeta;

  // A map of array guids to dependentKeys, for the given context.  We track
  // this because we want to set up the computed property potentially before the
  // dependent array even exists, but when the array observer fires, we lack
  // enough context to know what to update: we can recover that context by
  // getting the dependentKey.
  this.dependentKeysByGuid = {};

  // We suspend observers to ignore replacements from `reset` when totally
  // recomputing.  Unfortunately we cannot properly suspend the observers
  // because we only have the key; instead we make the observers no-ops
  this.suspended = false;

  // This is used to coalesce item changes from property observers within a
  // single item.
  this.changedItems = {};

  this.observersContextByGuid = {};
  this.observersReIndexByGuid = {};

}

DependentArraysObserver.prototype = {

  addItems: function(dependentArray, callbacks, cp, propertyName, meta) {
    var changeMeta = {};
    forEach(dependentArray, function (item, index) {
      ChangeMeta.call(changeMeta, dependentArray, item, index, propertyName, cp, dependentArray.length);
      meta.setValue( callbacks.addedItem.call(
        this, meta.getValue(), item, changeMeta, meta.sugarMeta));
    }, this);
    callbacks.flushedChanges.call(this, meta.getValue(), meta.sugarMeta);
  },

  setValue: function (newValue) {
    this.instanceMeta.setValue(newValue, true);
  },

  getValue: function () {
    return this.instanceMeta.getValue();
  },

  notifyPropertyChangeIfRequired: function () {
    this.instanceMeta.notifyPropertyChangeIfRequired();
  },

  setupObservers: function (dependentArray, dependentKey) {
    this.dependentKeysByGuid[guidFor(dependentArray)] = dependentKey;

    dependentArray.addArrayObserver(this, {
      willChange: 'dependentArrayWillChange',
      didChange: 'dependentArrayDidChange'
    });

    if (this.cp._itemPropertyKeys[dependentKey]) {
      this.setupPropertyObservers(dependentArray, this.cp._itemPropertyKeys[dependentKey]);
    }
  },

  teardownObservers: function (dependentArray, dependentKey) {
    var itemPropertyKeys = this.cp._itemPropertyKeys[dependentKey] || [];

    delete this.dependentKeysByGuid[guidFor(dependentArray)];

    this.teardownPropertyObservers(dependentArray, dependentKey, itemPropertyKeys);

    dependentArray.removeArrayObserver(this, {
      willChange: 'dependentArrayWillChange',
      didChange: 'dependentArrayDidChange'
    });
  },

  suspendArrayObservers: function (callback, binding) {
    var oldSuspended = this.suspended;
    this.suspended = true;
    callback.call(binding);
    this.suspended = oldSuspended;
  },

  setupPropertyObservers: function (dependentArray, itemPropertyKeys) {
      if(!dependentArray) return;
      var length = get(dependentArray, 'length');
      var observerContexts;

      this.observersContextByGuid[guidFor(dependentArray)] = observerContexts = new Array(length);

      forEach(dependentArray, function (item, index) {
        var observerContext = this.createPropertyObserverContext(dependentArray, index);
        observerContexts[index] = observerContext;

        forEach(itemPropertyKeys, function (propertyKey) {
          addObserver(item, propertyKey, this, observerContext.observer);
        }, this);
      }, this);
  },

  teardownPropertyObservers: function (dependentArray, dependentKey, itemPropertyKeys) {
    var dependentArrayObserver = this;
    var observerContexts = this.observersContextByGuid[guidFor(dependentArray)];
    var observer, item;

    if (observerContexts) {

      if (this.observersContextByGuid[guidFor(dependentArray)]) {
        delete this.observersContextByGuid[guidFor(dependentArray)];
      }


      forEach(observerContexts, function (observerContext) {
        observer = observerContext.observer;
        item = observerContext.item;

        forEach(itemPropertyKeys, function (propertyKey) {
          removeObserver(item, propertyKey, dependentArrayObserver, observer);
        });
      });
    }
  },

  createPropertyObserverContext: function (dependentArray, index) {
    var observerContext = new ItemPropertyObserverContext(dependentArray, index);

    this.createPropertyObserver(observerContext);

    return observerContext;
  },

  createPropertyObserver: function (observerContext) {
    var dependentArrayObserver = this;

    observerContext.observer = function (obj, keyName) {
      return dependentArrayObserver.itemPropertyDidChange(obj, keyName, observerContext.dependentArray, observerContext);
    };
  },

  dependentArrayWillChange: function (dependentArray, index, removedCount, addedCount) {
    if (this.suspended) { return; }

    var dependentKey, observerContexts, itemPropertyKeys, changeMeta, maxIndex, len, guid, removedItem, itemIndex, item;
    removedItem = this.callbacks.removedItem;
    changeMeta = {};
    guid = guidFor(dependentArray);
    dependentKey = this.dependentKeysByGuid[guid];
    itemPropertyKeys = this.cp._itemPropertyKeys[dependentKey] || [];
    len = get(dependentArray, 'length');
    if(index > len){
      index = len;
    }
    if(index < 0){
      index = len - removedCount-1;
    }
    maxIndex = index + removedCount;
    if(maxIndex >= len){
      maxIndex = len;
    }

    if(itemPropertyKeys.length){
      observerContexts = this.observersContextByGuid[guid];
    }

    function removeObservers(propertyKey) {
      if(itemIndex in observerContexts){
        var g = guidFor(item);
        if (g in this.changedItems){
          delete this.changedItems[g];
        }
        removeObserver(item, propertyKey, this, observerContexts[itemIndex].observer);
      }
    }

    //start from end, so filters work
    for (itemIndex = maxIndex-1; itemIndex >= index ; itemIndex--) {

      item = dependentArray.objectAt(itemIndex);

      if (observerContexts && observerContexts.length) {
        forEach(itemPropertyKeys, removeObservers, this);
      }

      ChangeMeta.call(changeMeta, dependentArray, item, itemIndex, this.instanceMeta.propertyName, this.cp, removedCount);
      this.setValue(removedItem.call(
        this.instanceMeta.context, this.getValue(), item, changeMeta, this.instanceMeta.sugarMeta));
    }

    if (observerContexts && this.needIndex && index <= observerContexts.length-1) {
      observerContexts.splice(index, removedCount);
      if (this.observersReIndexByGuid[guid] === undefined || index < this.observersReIndexByGuid[guid]) {
        this.observersReIndexByGuid[guid] = index;
      }
    }
  },

  dependentArrayDidChange: function (dependentArray, index, removedCount, addedCount) {
    if (this.suspended) { return; }

    var addedItem, dependentKey, observerContexts, observerContextsToAdd, itemPropertyKeys, changeMeta, maxIndex, len, guid, itemIndex, item, observerContext;
    addedItem = this.callbacks.addedItem;
    guid = guidFor(dependentArray);
    dependentKey = this.dependentKeysByGuid[guid];
    observerContexts = this.observersContextByGuid[guid];
    observerContextsToAdd = [];
    itemPropertyKeys = this.cp._itemPropertyKeys[dependentKey];
    changeMeta = {};
    len = get(dependentArray, 'length');
    if(index > len){
      index = len - addedCount;
    }
    if(index < 0){
      index = 0;
    }
    maxIndex = index + addedCount;
    if(maxIndex > len){
      maxIndex = len;
    }

    function updatePropertyKeys() {
      forEach(itemPropertyKeys, function (propertyKey) {
        addObserver(item, propertyKey, this, observerContext.observer);
      }, this);
    }

    for (itemIndex = index; itemIndex < maxIndex; itemIndex++) {

      item = dependentArray.objectAt(itemIndex);
      if (itemPropertyKeys) {
        observerContext = this.createPropertyObserverContext(dependentArray, itemIndex);
        observerContextsToAdd.push(observerContext);
        updatePropertyKeys();
      }
      ChangeMeta.call(changeMeta, dependentArray, item, itemIndex, this.instanceMeta.propertyName, this.cp, addedCount);
      this.setValue(addedItem.call(
        this.instanceMeta.context, this.getValue(), item, changeMeta, this.instanceMeta.sugarMeta));
    }
    if( observerContextsToAdd.length && this.needIndex){
      Array.prototype.splice.apply(observerContexts, [index, 0].concat(observerContextsToAdd));
      if (this.observersReIndexByGuid[guid] === undefined || index < this.observersReIndexByGuid[guid]) {
        this.observersReIndexByGuid[guid] = index;
      }
    }

    this.setValue( this.callbacks.flushedChanges.call(
        this.instanceMeta.context, this.getValue(), this.instanceMeta.sugarMeta)
    );
    this.notifyPropertyChangeIfRequired();
  },

  itemPropertyDidChange: function (obj, keyName, array, observerContext) {
    var guid = guidFor(obj);
    cacheRemove(this.cache, this.propertyName);
    if (!this.changedItems[guid]) {
      this.changedItems[guid] = {
        array: array,
        observerContext: observerContext,
        obj: obj
      };
    }
    this.instanceMeta.update = run.once(this, this._flushChanges);
  },

  _updateIndexes: function (array) {
    var itemIndex, observerContexts, guid;
    guid = guidFor(array);
    //updateIndexes
    if (this.needIndex && this.observersReIndexByGuid[guid] !== undefined) {
      observerContexts = this.observersContextByGuid[guid];
      var reIndexStart = this.observersReIndexByGuid[guid];
      for(itemIndex = reIndexStart; itemIndex < observerContexts.length; itemIndex++){
        observerContexts[itemIndex].index = itemIndex;
      }
      delete this.observersReIndexByGuid[guid];
    }
  },

  _flushChanges: function () {
    var changedItems = this.changedItems;
    var key, c, changeMeta = {};
    var callback;

    this.instanceMeta.update = null;

    if(this.callbacks.propertyChanged){
      callback = function(){
        this.setValue(
          this.callbacks.propertyChanged.call(this.instanceMeta.context, this.getValue(), c.obj, changeMeta, this.instanceMeta.sugarMeta));
      };
    }else{
      callback = function(){
        this.setValue(
          this.callbacks.removedItem.call(this.instanceMeta.context, this.getValue(), c.obj, changeMeta, this.instanceMeta.sugarMeta));
        this.setValue(
          this.callbacks.addedItem.call(this.instanceMeta.context, this.getValue(), c.obj, changeMeta, this.instanceMeta.sugarMeta));
      };
    }

    for (key in changedItems) {
      c = changedItems[key];
      this._updateIndexes(c.array);

      ChangeMeta.call(changeMeta, c.array, c.obj, c.observerContext.index, this.instanceMeta.propertyName, this.cp, changedItems.length);
      callback.call(this);

    }

    this.changedItems = {};
    this.callbacks.flushedChanges.call(this.instanceMeta.context, this.getValue(), this.instanceMeta.sugarMeta);
    this.notifyPropertyChangeIfRequired();
  }
};



export default DependentArraysObserver;
