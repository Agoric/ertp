import { test } from 'tape-promise/tape';
import harden from '@agoric/harden';

import { makeZoe } from '../../../../../core/zoe/zoe/zoe';
import { setup } from '../setupBasicMints';

test('zoe.makeInstance - simpleOfferSwap', async t => {
  try {
    const { assays: originalAssays, mints } = setup();
    const assays = originalAssays.slice(0, 2);
    const zoe = await makeZoe();
    const escrowReceiptAssay = zoe.getEscrowReceiptAssay();

    // Setup Alice
    const aliceMoolaPurse = mints[0].mint(assays[0].makeAssetDesc(3));
    const aliceMoolaPayment = aliceMoolaPurse.withdrawAll();
    const aliceSimoleanPurse = mints[1].mint(assays[1].makeAssetDesc(0));

    // Setup Bob
    const bobMoolaPurse = mints[0].mint(assays[0].makeAssetDesc(0));
    const bobSimoleanPurse = mints[1].mint(assays[1].makeAssetDesc(7));
    const bobSimoleanPayment = bobSimoleanPurse.withdrawAll();

    // 1: Alice creates a simpleSwap instance
    const { instance: aliceSwap, instanceId } = await zoe.makeInstance(
      'simpleOfferSwap',
      assays,
    );

    // 2: Alice escrows with zoe
    const aliceOfferDesc = harden([
      {
        rule: 'offerExactly',
        assetDesc: assays[0].makeAssetDesc(3),
      },
      {
        rule: 'wantExactly',
        assetDesc: assays[1].makeAssetDesc(7),
      },
    ]);
    const alicePayments = [aliceMoolaPayment, undefined];
    const {
      escrowReceipt: allegedAliceEscrowReceipt,
      claimPayoff: aliceClaimPayoff,
    } = await zoe.escrow(aliceOfferDesc, alicePayments);

    // 3: Alice does a claimAll on the escrowReceipt payment. It's
    // unnecessary if she trusts Zoe but we will do it for the tests.
    const aliceEscrowReceipt = await escrowReceiptAssay.claimAll(
      allegedAliceEscrowReceipt,
    );

    // 4: Alice initializes the swap with her escrow receipt
    const aliceOfferResult = await aliceSwap.makeOffer(aliceEscrowReceipt);

    // 5: Alice spreads the instanceId far and wide with instructions
    // on how to use it and Bob decides he wants to be the
    // counter-party.

    const { instance: bobSwap, libraryName } = zoe.getInstance(instanceId);
    t.equals(libraryName, 'simpleOfferSwap');
    const bobAssays = zoe.getAssaysForInstance(instanceId);
    t.deepEquals(bobAssays, assays);

    const bobOfferDesc = harden([
      {
        rule: 'wantExactly',
        assetDesc: bobAssays[0].makeAssetDesc(3),
      },
      {
        rule: 'offerExactly',
        assetDesc: bobAssays[1].makeAssetDesc(7),
      },
    ]);
    const bobPayments = [undefined, bobSimoleanPayment];

    // 6: Bob escrows with zoe
    const {
      escrowReceipt: allegedBobEscrowReceipt,
      claimPayoff: bobClaimPayoff,
    } = await zoe.escrow(bobOfferDesc, bobPayments);

    // 7: Bob does a claimAll on the escrowReceipt payment. This is
    // unnecessary but we will do it anyways for the test
    const bobEscrowReceipt = await escrowReceiptAssay.claimAll(
      allegedBobEscrowReceipt,
    );

    // 8: Bob makes an offer with his escrow receipt
    const bobOfferResult = await bobSwap.makeOffer(bobEscrowReceipt);

    t.equals(
      bobOfferResult,
      'The offer has been accepted. Once the contract has been completed, please check your winnings',
    );
    t.equals(
      aliceOfferResult,
      'The offer has been accepted. Once the contract has been completed, please check your winnings',
    );

    // 9: Alice unwraps the claimPayoff to get her seat
    const aliceSeat = await aliceClaimPayoff.unwrap();

    // 10: Bob unwraps his claimPayoff to get his seat
    const bobSeat = await bobClaimPayoff.unwrap();

    // 11: Alice claims her portion of the outcome (what Bob paid in)
    const aliceResult = await aliceSeat.getPayoff();

    // 12: Bob claims his position of the outcome (what Alice paid in)
    const bobResult = await bobSeat.getPayoff();

    // Alice gets back what she wanted
    t.deepEquals(aliceResult[1].getBalance(), aliceOfferDesc[1].assetDesc);

    // Alice didn't get any of what she put in
    t.equals(aliceResult[0].getBalance().extent, 0);

    // 13: Alice deposits her winnings to ensure she can
    await aliceMoolaPurse.depositAll(aliceResult[0]);
    await aliceSimoleanPurse.depositAll(aliceResult[1]);

    // 14: Bob deposits his original payments to ensure he can
    await bobMoolaPurse.depositAll(bobResult[0]);
    await bobSimoleanPurse.depositAll(bobResult[1]);

    // Assert that the correct winnings were received.
    // Alice had 3 moola and 0 simoleans.
    // Bob had 0 moola and 7 simoleans.
    t.equals(aliceMoolaPurse.getBalance().extent, 0);
    t.equals(aliceSimoleanPurse.getBalance().extent, 7);
    t.equals(bobMoolaPurse.getBalance().extent, 3);
    t.equals(bobSimoleanPurse.getBalance().extent, 0);
  } catch (e) {
    t.assert(false, e);
    console.log(e);
  } finally {
    t.end();
  }
});
