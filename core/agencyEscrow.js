/* global E makePromise */
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';
import { makeCollect } from './contractHost';
import { mustBeSameStructure } from '../util/sameStructure';

// There are two parties to this transaction. The buyer is offering some amount
// of currency for a valuable item. The buyer will either get the item, and
// possibly a return of some currency, or will get all their offer back. The
// agency needs to see the offer before making their determination. Only the
// amount is visible to the agency before an escrow seat is received for the
// transaction.
const agencyEscrow = {
  start: (terms, inviteMaker) => {
    const collect = makeCollect();
    const { left: currencyAmount, right: goodsAmount } = terms;

    // We want to give the buyer a promise for the good, and for a refund. The
    // refund will resolve either to all the buyer's deposit, or the portion of
    // the deposit that wasn't required. The agency will get an invite for a seat
    // that can ask the amount deposited, and then either cancel or provide an
    // escrow seat with a specific price lower than the amount.

    // Winnings and refund will be resolved if the offer is consummated. If it's
    // cancelled, only refund will be resolved. Winnings will contain the item
    // or nothing. Refund contains currency or nothing.
    const winnings = makePromise();
    const refund = makePromise();
    // Deposit contains currency.
    const deposit = makePromise();

    // Seats

    const agencySeat = harden({
      // Tell the agency the amount of the bid.
      offerAmount() {
        return E.resolve(deposit).then(funds => {
          return funds.amount.getQuantity();
        });
      },
      // The agency can cancel offers and return the funds
      cancel() {
        winnings.reject('no deal');
        refund.res(deposit);
      },
      // The agency can accept one offer and collect the bidder's price or less.
      // The bidder will receive their winnings through a trusted escrow.
      consummateDeal(price, escrowInvitation) {
        const escrowSeat = inviteMaker.redeem(escrowInvitation);
        const currencyPurse = currencyAmount.label.issuer.makeEmptyPurse();
        const goodsPurse = goodsAmount.label.issuer.makeEmptyPurse();
        E(deposit)
          .withdraw(price)
          .then(moneyPaymentP => {
            escrowSeat.offer(moneyPaymentP);
            collect(escrowSeat, goodsPurse, currencyPurse, 'winning bidder');
            refund.res(currencyPurse);
            winnings.res(goodsPurse);
          });
      },
    });

    const buyerSeat = harden({
      // The buyer provides an offer that will be escrowed, then either returned
      // or traded for the desired goods.
      offer(currencyOffer) {
        const currencyIssuer = currencyAmount.label.issuer;
        return E(currencyIssuer)
          .getExclusiveAll(currencyOffer, 'deposit')
          .then(prePayment => {
            deposit.res(prePayment);
          });
      },
      // a promise for a purse for the goods.
      getWinnings() {
        return winnings.p;
      },
      // a promise for a purse for any returned funds.
      getRefund() {
        return refund.p;
      },
    });

    return harden({
      agency: inviteMaker.make('agency', agencySeat),
      buyer: inviteMaker.make('buyer', buyerSeat),
    });
  },

  checkAmount: (installation, allegedInviteAmount, expectedTerms, seat) => {
    mustBeSameStructure(allegedInviteAmount.quantity.seatDesc, seat);
    const allegedTerms = allegedInviteAmount.quantity.terms;
    mustBeSameStructure(
      allegedTerms,
      expectedTerms,
      'AgencyEscrow checkAmount',
    );
    mustBeSameStructure(
      allegedInviteAmount.quantity.installation,
      installation,
      'escrow checkAmount installation',
    );
    return true;
  },
};

const agencyEscrowSrcs = {
  start: `${agencyEscrow.start}`,
  checkAmount: `${agencyEscrow.checkAmount}`,
};

export { agencyEscrowSrcs };
