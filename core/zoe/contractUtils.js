import harden from '@agoric/harden';
import Nat from '@agoric/nat';

import makePromise from '../../util/makePromise';

// These utilities are likely to be helpful to developers writing
// governing contracts.

// https://stackoverflow.com/questions/17428587/transposing-a-2d-array-in-javascript/41772644#41772644
const transpose = matrix =>
  matrix.reduce(
    (acc, row) => row.map((_, i) => [...(acc[i] || []), row[i]]),
    [],
  );

/**
 * @param  {[][]} matrix - array of arrays
 * @param  {function[]} arrayFn - the array of functions to apply
 */
const mapArrayOnMatrix = (matrix, arrayFn) => {
  return matrix.map(row => row.map((x, i) => arrayFn[i](x, i)));
};

const ruleEqual = (leftRule, rightRule) => leftRule.rule === rightRule.rule;

const quantityEqual = (strategy, leftRule, rightRule) =>
  strategy.equals(leftRule.amount.quantity, rightRule.amount.quantity);

const issuerEqual = (leftRule, rightRule) =>
  leftRule.amount.label.issuer === rightRule.amount.label.issuer;

// Check that two offers are equal in both their rules and their amounts
const offerEqual = (strategies, leftOffer, rightOffer) => {
  const isLengthEqual = leftOffer.length === rightOffer.length;
  if (!isLengthEqual) {
    return false;
  }
  return leftOffer.every(
    (leftRule, i) =>
      ruleEqual(leftRule, rightOffer[i]) &&
      issuerEqual(leftRule, rightOffer[i]) &&
      quantityEqual(strategies[i], leftRule, rightOffer[i]),
    true,
  );
};

// an array of empty quantities per strategy
const makeEmptyQuantities = strategies =>
  strategies.map(strategy => strategy.empty());

// validRules is the rule portion of a offer description in array
// form, such as ['offerExactly', 'wantExactly']
const makeHasOkRules = validRules => offer =>
  validRules.every((rule, i) => rule === offer[i].rule, true);

// Vector addition of two quantity arrays
const vectorWith = (strategies, leftQuantities, rightQuantities) =>
  leftQuantities.map((leftQ, i) =>
    strategies[i].with(leftQ, rightQuantities[i]),
  );

// Vector subtraction of two quantity arrays
const vectorWithout = (strategies, leftQuantities, rightQuantities) =>
  leftQuantities.map((leftQ, i) =>
    strategies[i].without(leftQ, rightQuantities[i]),
  );

/**
 * Make a function that implements a common invocation pattern for
 * contract developers:
 * 1) Take an `escrowReceipt` as input.
 * 2) Validate it
 * 3) Check that the offer gotten from the `escrowReceipt` is valid
 *    for this particular contract
 * 4) Fail-fast if the offer isn't valid
 * 5) Handle the valid offer
 * 6) Reallocate and eject the player.
 * @param  {object} zoe - the governing contract facet of zoe
 * @param  {function} isValidOfferFn - a predicate that takes in an offerDesc
 * and returns whether it is a valid offer or not
 * @param  {string} successMessage - the message that the promise should
 * resolve to if the offer is successful
 * @param  {string} rejectMessage - the message that the promise should
 * reject with if the offer is not valid
 * @param  {function} handleOfferFn - the function to do custom logic before
 * reallocating and ejecting the user. The function takes in the
 * `offerId` and should return an object with `offerIds` and
 * `newQuantities` as properties
 * @param {object} instanceId - the id for the governing contract instance
 * @param  {} }
 */
const makeAPIMethod = ({
  zoe,
  isValidOfferFn,
  successMessage,
  rejectMessage,
  handleOfferFn,
  instanceId,
}) => async escrowReceipt => {
  const result = makePromise();
  const { id, offerMade: offerMadeDesc } = await zoe.burnEscrowReceipt(
    instanceId,
    escrowReceipt,
  );
  // fail-fast if the offerDesc isn't valid
  if (!isValidOfferFn(offerMadeDesc)) {
    zoe.complete(instanceId, harden([id]));
    result.rej(`${rejectMessage}`);
    return result.p;
  }
  const { offerIds, newQuantities, burnQuantities } = await handleOfferFn(id);
  if (burnQuantities !== undefined) {
    await zoe.reallocateAndBurn(
      instanceId,
      offerIds,
      newQuantities,
      burnQuantities,
    );
  } else {
    zoe.reallocate(instanceId, offerIds, newQuantities);
  }
  zoe.complete(instanceId, harden([id]));
  result.res(`${successMessage}`);
  return result.p;
};

const makeAmount = (strategy, label, allegedQuantity) => {
  strategy.insistKind(allegedQuantity);
  return harden({
    label,
    quantity: allegedQuantity,
  });
};

// Transform a quantitiesMatrix to a matrix of amounts given an array
// of the associated assays.
const toAmountMatrix = (strategies, labels, quantitiesMatrix) =>
  quantitiesMatrix.map(quantities =>
    quantities.map((quantity, i) =>
      makeAmount(strategies[i], labels[i], quantity),
    ),
  );

const makeOfferDesc = (strategies, labels, rules, quantities) =>
  strategies.map((strategy, i) =>
    harden({
      rule: rules[i],
      amount: makeAmount(strategy, labels[i], quantities[i]),
    }),
  );

/**
 * These operations should be used for calculations with the
 * quantities of basic fungible tokens.
 */
const basicFungibleTokenOperations = harden({
  add: (x, y) => Nat(x + y),
  subtract: (x, y) => Nat(x - y),
  multiply: (x, y) => Nat(x * y),
  divide: (x, y) => Nat(Math.floor(x / y)),
});

// reproduced, got lost in merge, not sure if correct
const amountsToQuantitiesArray = (strategies, amounts) =>
  amounts.map((amount, i) =>
    amount === undefined ? strategies[i].empty() : amount.quantity,
  );

export {
  transpose,
  mapArrayOnMatrix,
  offerEqual,
  makeEmptyQuantities,
  makeHasOkRules,
  vectorWith,
  vectorWithout,
  makeAPIMethod,
  basicFungibleTokenOperations,
  makeAmount,
  makeOfferDesc,
  toAmountMatrix,
  amountsToQuantitiesArray,
};
