# Ember-cli-reduce-computed

the ember reduced-computed and array-computed as addon

##Addon Install
`ember install:addon patricklx/ember-cli-reduce-computed`

however the computed.* functions will still use the old implementation, 
therefore you also need to install the addon [ember-cli-reduce-computed-macros](https://github.com/patricklx/ember-cli-reduce-computed-macros)


then in your app:

`import install from 'ember-cli-reduce-computed';`
`install()`


## API difference
- new callback: `propertyChanged`
- item property changes are coalesced and applied asynchronously with `run.once`. 
They are, however, applied immediately if `get` is called  for the reduceComputed property.
- array changes are applied immediately.
- if you need the index you need to specify `needIndex` in the `options`
- if `undefined` is returned, the value will be recalculated on the next `get` 

## API Description
  Creates a computed property which operates on dependent arrays and
  is updated with "one at a time" semantics. When items are added or
  removed from the dependent array(s) a reduce computed only operates
  on the change instead of re-evaluating the entire array.
  
  If there are more than one arguments the first arguments are
  considered to be dependent property keys. The last argument is
  required to be an options object. The options object can have the
  following four properties:
  
  `hasOwnInitialValue` - If this is set to true, the initialValue function is responsible for all preparations, e.g.: 
  adding items to the array, setting the initialValue. This can be used to optimize the calculation of the initial value.
  
  `initialValue` - A value or function that will be used as the initial
  value for the computed. If this property is a function the result of calling
  the function will be used as the initial value. This property is required.
  
  `initialize` - An optional initialize function. Typically this will be used
  to set up state on the instanceMeta object.
  
  `removedItem` - A function that is called each time an element is removed
  from the array.
  
  `addedItem` - A function that is called each time an element is added to
  the array.
  
  `propertyChanged` - A function that is called each time an element's property changes, 
   if this function is not defined `removedItem` and `addedItem` will be called instead
   
   `flushedChanges` - A function that is called after all changes have been flushed. 
   It's called after items have been removed and/or added to the array and 
   after all itemProperty changes have been flushed.
  
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


## Installation

* `git clone` this repository
* `npm install`
* `bower install`

## Running

* `ember server`
* Visit your app at http://localhost:4200.

## Running Tests

* `ember test`
* `ember test --server`

## Building

* `ember build`

For more information on using ember-cli, visit [http://www.ember-cli.com/](http://www.ember-cli.com/).
