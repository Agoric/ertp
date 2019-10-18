import harden from '@agoric/harden';
import { insist } from '../../../util/insist';
import { sameStructure } from '../../../util/sameStructure';

const build = async (E, log, zoe, moolaPurseP, simoleanPurseP, installId) => {
  const showPaymentBalance = async (paymentP, name) => {
    try {
      const assetDesc = await E(paymentP).getBalance();
      log(name, ': balance ', assetDesc);
    } catch (err) {
      console.error(err);
    }
  };

  return harden({
    doAutomaticRefund: async instanceId => {
      const {
        instance: automaticRefund,
        installationId: automaticRefundInstallationId,
      } = await E(zoe).getInstance(instanceId);

      // Bob ensures it's the contract he expects
      insist(
        installId === automaticRefundInstallationId,
      )`should be the expected automaticRefund`;

      const moolaAssay = await E(moolaPurseP).getAssay();
      const simoleanAssay = await E(simoleanPurseP).getAssay();

      const assays = [moolaAssay, simoleanAssay];

      const contractAssays = await E(zoe).getAssaysForInstance(instanceId);
      insist(
        contractAssays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        contractAssays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      // 1. Bob escrows his offer
      const bobConditions = harden({
        offerDesc: [
          {
            rule: 'wantExactly',
            assetDesc: await E(assays[0]).makeAssetDesc(15),
          },
          {
            rule: 'offerExactly',
            assetDesc: await E(assays[1]).makeAssetDesc(17),
          },
        ],
        exit: {
          kind: 'noExit',
        },
      });

      const bobSimoleanPayment = await E(simoleanPurseP).withdrawAll();

      const bobPayments = [undefined, bobSimoleanPayment];

      const { escrowReceipt, payoff: payoffP } = await E(zoe).escrow(
        bobConditions,
        bobPayments,
      );

      // 2. Bob makes an offer with his escrow receipt
      const bobOfferMadeDesc = await E(automaticRefund).makeOffer(
        escrowReceipt,
      );

      log(bobOfferMadeDesc);

      const bobResult = await payoffP;

      // 5: Bob deposits his winnings
      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },

    doCoveredCall: async (inviteP, instanceId) => {
      // Bob claims all with the Zoe inviteAssay
      const inviteAssay = await E(zoe).getInviteAssay();
      const invite = await E(inviteAssay).claimAll(inviteP);

      const moolaAssay = await E(moolaPurseP).getAssay();
      const simoleanAssay = await E(simoleanPurseP).getAssay();

      const assays = [moolaAssay, simoleanAssay];

      const bobIntendedConditions = harden({
        offerDesc: [
          {
            rule: 'wantExactly',
            assetDesc: await E(assays[0]).makeAssetDesc(3),
          },
          {
            rule: 'offerExactly',
            assetDesc: await E(assays[1]).makeAssetDesc(7),
          },
        ],
        exit: {
          kind: 'noExit',
        },
      });

      // Bob checks that the invite is for the right covered call
      const { extent: inviteExtent } = await E(invite).getBalance();
      insist(inviteExtent.instanceId === instanceId)`wrong instance`;
      insist(inviteExtent.installationId === installId)`wrong installation`;
      insist(inviteExtent.status, 'acceptingOffers')`not accepting offers`;
      insist(
        sameStructure(
          inviteExtent.offerToBeMade,
          bobIntendedConditions.offerDesc,
        ),
      )`the offer to be made was not as expected`;

      const contractAssays = await E(zoe).getAssaysForInstance(instanceId);
      insist(
        contractAssays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        contractAssays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      // Only after assaying the invite does he unwrap it (destroying
      // the ERTP invite) and accept it
      const unwrappedInvite = await E(invite).unwrap();
      const bobSimoleanPayment = await E(simoleanPurseP).withdrawAll();
      const bobPayments = [undefined, bobSimoleanPayment];

      // Bob escrows
      const { escrowReceipt, payoff: payoffP } = await E(zoe).escrow(
        bobIntendedConditions,
        bobPayments,
      );

      // 8: Bob makes an offer with his escrow receipt
      const bobOutcome = await E(unwrappedInvite).makeOffer(escrowReceipt);

      log(bobOutcome);

      const bobResult = await payoffP;

      // 5: Bob deposits his winnings
      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },
  });
};

const setup = (syscall, state, helpers) =>
  helpers.makeLiveSlots(syscall, state, E =>
    harden({
      build: (...args) => build(E, helpers.log, ...args),
    }),
  );
export default harden(setup);
