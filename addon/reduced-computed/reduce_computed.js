import Ember from 'ember';
import ReduceComputedPropertyInstanceMeta from './instance_meta';
import DependentArraysObserver from './dependent_array_observer';

var e_get = Ember.get;
var guidFor = Ember.guidFor;
var metaFor = Ember.meta;
var EmberError = Ember.Error;

var expandProperties = Ember.expandProperties;
var addObserver = Ember.addObserver;
var ComputedProperty = Ember.ComputedProperty;

var o_create = Ember.create;
var forEach = Ember.EnumerableUtils.forEach || function () {
    return Array.prototype.forEach.call(arguments);
  };
var EmberArray = Ember.Array;
var run = Ember.run;
var isArray = Ember.isArray;

var a_slice = [].slice;
// Here we explicitly don't allow `@each.foo`; it would require some special
// testing, but there's no particular reason why it should be disallowed.
var eachPropertyPattern = /^(.*)\.@each\.(.*)/;
var doubleEachPropertyPattern = /(.*\.@each){2,}/;
var arrayBracketPattern = /\.\[\]$/;

function get(obj, key) {
  if (key === '@this') {
    return obj;
  }

  return e_get(obj, key);
}


function reset(cp, propertyName) {
  var meta = cp._instanceMeta(this, propertyName);
  meta.forceFlush();
  meta.setInitialValue(
    cp.initialValue(this, meta)
  );
  if (cp.options.initialize) {
    cp.options.initialize.call(this, meta.getValue(), {
      property: cp,
      propertyName: propertyName
    }, meta.sugarMeta);
  }
}

function partiallyRecomputeFor(obj, dependentKey) {
  if (arrayBracketPattern.test(dependentKey)) {
    return false;
  }

  var value = get(obj, dependentKey);
  return EmberArray.detect(value);
}



/**
 A computed property whose dependent keys are arrays and which is updated with
 "one at a time" semantics.

 @class ReduceComputedProperty
 @namespace Ember
 @extends Ember.ComputedProperty
 @constructor
 */

export { ReduceComputedProperty }; // TODO: default export

function ReduceComputedProperty(options) {


  this.options = options;
  this._dependentArrays = null;
  // A map of dependentKey -> [itemProperty, ...] that tracks what properties of
  // items in the array we must track to update this property.
  this._itemPropertyKeys = {};
  this._previousItemPropertyKeys = {};

  this.instanceMeta = {};

  this.readOnly();

  this.recomputeOnce = function(propertyName, cp) {
    run.once(this, setup, propertyName, false, cp);
  };

  var addItems = function (propertyName, firstSetup, cp) {
    var meta = cp._instanceMeta(this, propertyName);
    var callbacks = cp._callbacks();
    if(!cp.options.hasOwnInitialValue){
      forEach(cp._dependentArrays, function(dependentKey) {
        if (!partiallyRecomputeFor(this, dependentKey)) { return; }

        var dependentArray = get(this, dependentKey);

        if (dependentArray) {
          DependentArraysObserver.prototype.addItems.call(this, dependentArray, callbacks, cp, propertyName, meta);
        }
      }, this);
    }
    if(!firstSetup){
      meta.dependentArraysObserver.notifyPropertyChangeIfRequired();
    }else{
      meta.dependentArraysObserver.instanceMeta.valueChanged = false;
    }
  };

  var setup = function (propertyName, firstSetup, cp) {

    var meta = cp._instanceMeta(this, propertyName);

    reset.call(this, cp, propertyName);

    meta.dependentArraysObserver.suspendArrayObservers(function () {
      forEach(cp._dependentArrays, function (dependentKey) {
        Ember.assert(
          'dependent array ' + dependentKey + ' must be an `Ember.Array`.  ' +
          'If you are not extending arrays, you will need to wrap native arrays with `Ember.A`',
          !(isArray(get(this, dependentKey)) && !EmberArray.detect(get(this, dependentKey))));

        if (!partiallyRecomputeFor(this, dependentKey)) { return; }

        var dependentArray = get(this, dependentKey);
        var previousDependentArray = meta.dependentArrays[dependentKey];

        if (dependentArray === previousDependentArray) {
          // The array may be the same, but our item property keys may have
          // changed, so we set them up again.  We can't easily tell if they've
          // changed: the array may be the same object, but with different
          // contents.
          if (cp._previousItemPropertyKeys[dependentKey]) {
            delete cp._previousItemPropertyKeys[dependentKey];
            meta.dependentArraysObserver.setupPropertyObservers(dependentArray, cp._itemPropertyKeys[dependentKey]);
          }
        } else {
          meta.dependentArrays[dependentKey] = dependentArray;

          if (previousDependentArray) {
            meta.dependentArraysObserver.teardownObservers(previousDependentArray, dependentKey);
          }

          if (dependentArray) {
            meta.dependentArraysObserver.setupObservers(dependentArray, dependentKey);
          }
        }
      }, this);
    }, this);
    addItems.call(this, propertyName, firstSetup, cp)
  };

  var _getter = function (_cp) {
    return function (propertyName) {
      Ember.assert('Computed reduce values require at least one dependent key', _cp._dependentArrays);
      if (!_cp._hasInstanceMeta(this, propertyName)) {
        // When we recompute an array computed property, we need already
        // retrieved arrays to be updated; we can't simply empty the cache and
        // hope the array is re-retrieved.

        var recompute = function (_this, propertyName, cp) {
          return function () {
            cp.recomputeOnce.call(_this, propertyName, cp);
          };
        };

        setup.call(this, propertyName, true, _cp);
        forEach(_cp._dependentArrays, function (dependentKey) {
          addObserver(this, dependentKey, recompute(this, propertyName, _cp));
        }, this);
        forEach(_cp._dependentKeys, function (dependentKey) {
          addObserver(this, dependentKey, recompute(this, propertyName, _cp));
        }, this);
      } else {
        if (_cp._instanceMeta(this, propertyName).shouldRecompute()) {
          reset.call(this, _cp, propertyName);
          addItems.call(this, propertyName, true, _cp);
        }
      }
      return _cp._instanceMeta(this, propertyName).getValue();
    }
  };
  this._getter = _getter(this);
  //maintain backwards compatibility
  this.func = this._getter;
}

ReduceComputedProperty.prototype = o_create(ComputedProperty.prototype);

function defaultCallback(computedValue) {
  return computedValue;
}

ReduceComputedProperty.prototype._callbacks = function () {
  if (!this.callbacks) {
    var options = this.options;

    this.callbacks = {
      removedItem: options.removedItem || defaultCallback,
      addedItem: options.addedItem || defaultCallback,
      propertyChanged: options.propertyChanged,
      flushedChanges: options.flushedChanges || defaultCallback
    };
  }

  return this.callbacks;
};

ReduceComputedProperty.prototype._hasInstanceMeta = function (context, propertyName) {
  var cacheMeta = this.instanceMeta[guidFor(context)];
  return !!(cacheMeta && cacheMeta[propertyName]);
};

ReduceComputedProperty.prototype._instanceMeta = function (context, propertyName) {
  var cacheMeta = this.instanceMeta[guidFor(context)];

  if(!cacheMeta){
    cacheMeta = this.instanceMeta[guidFor(context)] = {};
  }

  var meta = cacheMeta[propertyName];

  if (!meta) {
    meta = cacheMeta[propertyName] = new ReduceComputedPropertyInstanceMeta(context, propertyName);
    meta.dependentArraysObserver = new DependentArraysObserver(this._callbacks(), this, meta, context, propertyName, meta.sugarMeta);
  }

  return meta;
};

ReduceComputedProperty.prototype.initialValue = function (context, meta) {
  if (typeof this.options.initialValue === 'function') {
    return this.options.initialValue.call(context, this, meta);
  }
  else {
    return this.options.initialValue;
  }
};

ReduceComputedProperty.prototype.itemPropertyKey = function (dependentArrayKey, itemPropertyKey) {
  this._itemPropertyKeys[dependentArrayKey] = this._itemPropertyKeys[dependentArrayKey] || [];
  this._itemPropertyKeys[dependentArrayKey].push(itemPropertyKey);
};

ReduceComputedProperty.prototype.clearItemPropertyKeys = function (dependentArrayKey) {
  if (this._itemPropertyKeys[dependentArrayKey]) {
    this._previousItemPropertyKeys[dependentArrayKey] = this._itemPropertyKeys[dependentArrayKey];
    this._itemPropertyKeys[dependentArrayKey] = [];
  }
};

ReduceComputedProperty.prototype.property = function () {
  var cp = this;
  var args = a_slice.call(arguments);
  var propertyArgs = {};
  var match, dependentArrayKey, ret;

  forEach(args, function (dependentKey) {
    if (doubleEachPropertyPattern.test(dependentKey)) {
      throw new EmberError('Nested @each properties not supported: ' + dependentKey);
    } else if (match = eachPropertyPattern.exec(dependentKey)) {
      dependentArrayKey = match[1];

      var itemPropertyKeyPattern = match[2];
      var addItemPropertyKey = function (itemPropertyKey) {
        cp.itemPropertyKey(dependentArrayKey, itemPropertyKey);
      };

      expandProperties(itemPropertyKeyPattern, addItemPropertyKey);
      propertyArgs[guidFor(dependentArrayKey)] = dependentArrayKey;
    } else {
      propertyArgs[guidFor(dependentKey)] = dependentKey;
    }
  });

  var propertyArgsToArray = [];
  for (var guid in propertyArgs) {
    propertyArgsToArray.push(propertyArgs[guid]);
  }

  if (this._dependentArrays) {
    return this;
  }

  ret = ComputedProperty.prototype.property.apply(this, propertyArgsToArray);
  cp._dependentArrays = cp._dependentKeys;
  cp._dependentKeys = [];
  return ret;
};

/**
 Creates a computed property which operates on dependent arrays and
 is updated with "one at a time" semantics. When items are added or
 removed from the dependent array(s) a reduce computed only operates
 on the change instead of re-evaluating the entire array.

 If there are more than one arguments the first arguments are
 considered to be dependent property keys. The last argument is
 required to be an options object. The options object can have the
 following four properties:

 `initialValue` - A value or function that will be used as the initial
 value for the computed. If this property is a function the result of calling
 the function will be used as the initial value. This property is required.

 `initialize` - An optional initialize function. Typically this will be used
 to set up state on the instanceMeta object.

 `removedItem` - A function that is called each time an element is removed
 from the array.

 `addedItem` - A function that is called each time an element is added to
 the array.


 The `initialize` function has the following signature:

 ```javascript
 function(initialValue, changeMeta, instanceMeta)
 ```

 `initialValue` - The value of the `initialValue` property from the
 options object.

 `changeMeta` - An object which contains meta information about the
 computed. It contains the following properties:

 - `property` the computed property
 - `propertyName` the name of the property on the object

 `instanceMeta` - An object that can be used to store meta
 information needed for calculating your computed. For example a
 unique computed might use this to store the number of times a given
 element is found in the dependent array.


 The `removedItem` and `addedItem` functions both have the following signature:

 ```javascript
 function(accumulatedValue, item, changeMeta, instanceMeta)
 ```

 `accumulatedValue` - The value returned from the last time
 `removedItem` or `addedItem` was called or `initialValue`.

 `item` - the element added or removed from the array

 `changeMeta` - An object which contains meta information about the
 change. It contains the following properties:

 - `property` the computed property
 - `propertyName` the name of the property on the object
 - `index` the index of the added or removed item
 - `item` the added or removed item: this is exactly the same as
 the second arg
 - `arrayChanged` the array that triggered the change. Can be
 useful when depending on multiple arrays.

 For property changes triggered on an item property change (when
 depKey is something like `someArray.@each.someProperty`),
 `changeMeta` will also contain the following property:

 `instanceMeta` - An object that can be used to store meta
 information needed for calculating your computed. For example a
 unique computed might use this to store the number of times a given
 element is found in the dependent array.

 The `removedItem` and `addedItem` functions should return the accumulated
 value. It is acceptable to not return anything (ie return undefined)
 to invalidate the computation. This is generally not a good idea for
 arrayComputed but it's used in eg max and min.

 Note that observers will be fired if either of these functions return a value
 that differs from the accumulated value.  When returning an object that
 mutates in response to array changes, for example an array that maps
 everything from some other array (see `Ember.computed.map`), it is usually
 important that the *same* array be returned to avoid accidentally triggering observers.

 Example

 ```javascript
 Ember.computed.max = function(dependentKey) {
    return Ember.reduceComputed(dependentKey, {
      initialValue: -Infinity,

      addedItem: function(accumulatedValue, item, changeMeta, instanceMeta) {
        return Math.max(accumulatedValue, item);
      },

      removedItem: function(accumulatedValue, item, changeMeta, instanceMeta) {
        if (item < accumulatedValue) {
          return accumulatedValue;
        }
      }
    });
  };
 ```

 Dependent keys may refer to `@this` to observe changes to the object itself,
 which must be array-like, rather than a property of the object.  This is
 mostly useful for array proxies, to ensure objects are retrieved via
 `objectAtContent`.  This is how you could sort items by properties defined on an item controller.

 Example

 ```javascript
 App.PeopleController = Ember.ArrayController.extend({
    itemController: 'person',

    sortedPeople: Ember.computed.sort('@this.@each.reversedName', function(personA, personB) {
      // `reversedName` isn't defined on Person, but we have access to it via
      // the item controller App.PersonController.  If we'd used
      // `content.@each.reversedName` above, we would be getting the objects
 // directly and not have access to `reversedName`.
 //
 var reversedNameA = get(personA, 'reversedName');
 var reversedNameB = get(personB, 'reversedName');

 return Ember.compare(reversedNameA, reversedNameB);
 })
 });

 App.PersonController = Ember.ObjectController.extend({
    reversedName: function() {
      return reverse(get(this, 'name'));
    }.property('name')
  });
 ```

 Dependent keys whose values are not arrays are treated as regular
 dependencies: when they change, the computed property is completely
 recalculated.  It is sometimes useful to have dependent arrays with similar
 semantics.  Dependent keys which end in `.[]` do not use "one at a time"
 semantics.  When an item is added or removed from such a dependency, the
 computed property is completely recomputed.

 When the computed property is completely recomputed, the `accumulatedValue`
 is discarded, it starts with `initialValue` again, and each item is passed
 to `addedItem` in turn.

 Example

 ```javascript
 Ember.Object.extend({
    // When `string` is changed, `computed` is completely recomputed.
    string: 'a string',

    // When an item is added to `array`, `addedItem` is called.
    array: [],

    // When an item is added to `anotherArray`, `computed` is completely
    // recomputed.
    anotherArray: [],

    computed: Ember.reduceComputed('string', 'array', 'anotherArray.[]', {
      addedItem: addedItemCallback,
      removedItem: removedItemCallback
    })
  });
 ```

 @method reduceComputed
 @for Ember
 @param {String} [dependentKeys*]
 @param {Object} options
 @return {Ember.ComputedProperty}
 */
export function reduceComputed(options) {
  var args;

  if (arguments.length > 1) {
    args = a_slice.call(arguments, 0, -1);
    options = a_slice.call(arguments, -1)[0];
  }

  if (typeof options !== 'object') {
    throw new EmberError('Reduce Computed Property declared without an options hash');
  }

  if (!('initialValue' in options)) {
    throw new EmberError('Reduce Computed Property declared without an initial value');
  }

  var cp = new ReduceComputedProperty(options);

  if (args) {
    cp.property.apply(cp, args);
  }

  return cp;
}
