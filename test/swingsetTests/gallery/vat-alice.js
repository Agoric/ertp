// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../../util/insist';
import { makeCollect } from '../../../core/contractHost';
import { escrowExchangeSrcs } from '../../../core/escrow';

// only used by doCreateFakeChild test below
import { makeMint } from '../../../core/issuers';
import { makePixelConfigMaker } from '../../../more/pixels/pixelConfig';

let storedUseObj;
let storedERTPAsset;

function makeAliceMaker(E, log, contractHost) {
  const collect = makeCollect(E, log);

  // TODO BUG: All callers should wait until settled before doing
  // anything that would change the balance before show*Balance* reads
  // it.
  function showPaymentBalance(name, paymentP) {
    return E(paymentP)
      .getBalance()
      .then(amount => log(name, ' balance ', amount));
  }

  return harden({
    make(gallery) {
      function createSaleOffer(pixelPaymentP, dustPurseP) {
        return Promise.resolve(pixelPaymentP).then(async pixelPayment => {
          const { pixelIssuer, dustIssuer } = await E(gallery).getIssuers();
          const pixelAmount = await E(pixelPayment).getBalance();
          const dustAmount = await E(E(dustIssuer).getAssay()).make(37);
          const terms = harden({ left: dustAmount, right: pixelAmount });
          const escrowExchangeInstallationP = E(contractHost).install(
            escrowExchangeSrcs,
          );
          const { left: buyerInviteP, right: sellerInviteP } = await E(
            escrowExchangeInstallationP,
          ).spawn(terms);
          const seatP = E(contractHost).redeem(sellerInviteP);
          E(seatP).offer(pixelPayment);
          E(E(seatP).getWinnings())
            .getBalance()
            .then(b =>
              log(`Alice collected ${b.quantity} ${b.label.description}`),
            );
          const pixelPurseP = E(pixelIssuer).makeEmptyPurse();
          collect(seatP, dustPurseP, pixelPurseP, 'alice escrow');
          return { buyerInviteP, contractHost };
        });
      }

      const alice = harden({
        doTapFaucet() {
          log('++ alice.doTapFaucet starting');
          const pixelPaymentP = E(E(gallery).tapFaucet()).getERTP();
          showPaymentBalance('pixel from faucet', pixelPaymentP);
        },
        async doChangeColor() {
          log('++ alice.doChangeColor starting');
          const changedAmount = await E(E(gallery).tapFaucet()).changeColorAll(
            '#000000',
          );
          log('tapped Faucet');
          return changedAmount;
        },
        async doSendOnlyUseRight(bob) {
          log('++ alice.doOnlySendUseRight starting');
          const pixels = E(gallery).tapFaucet();
          log('tapped Faucet');
          const pixelPaymentP = E(pixels).getERTP();
          const rawPixels = await E(pixels).getRawPixels();
          const rawPixel = rawPixels[0];
          const origColors = await E(pixels).getColors();

          log(
            `pixel x:${rawPixel.x}, y:${rawPixel.y} has original color ${origColors[0].color}`,
          );

          // create child use object and send to bob
          // keep the original ERTP object and use right obj

          const delegatedUseObj = await E(pixelPaymentP).getDelegatedUse();

          const result = await E(bob).receiveUseObj(delegatedUseObj);
          const bobsRawPixel = result.quantity[0];
          insist(
            bobsRawPixel.x === rawPixel.x && bobsRawPixel.y === rawPixel.y,
          );
          const bobsColor = await E(gallery).getPixelColor(
            rawPixel.x,
            rawPixel.y,
          );
          log(
            `pixel x:${rawPixel.x}, y:${rawPixel.y} changed to bob's color ${bobsColor}`,
          );

          // alice takes the right back
          await E(pixelPaymentP).revokeChildren();
          await E(pixels).changeColorAll(
            '#9FBF95', // a light green
          );

          const alicesColor = await E(gallery).getPixelColor(
            rawPixel.x,
            rawPixel.y,
          );
          log(
            `pixel x:${rawPixel.x}, y:${rawPixel.y} changed to alice's color ${alicesColor}`,
          );

          // tell bob to try to color, he can't

          try {
            await E(bob)
              .tryToColorPixels()
              .then(
                _res => log('uh oh, bob was able to color'),
                rej => log(`bob was unable to color: ${rej}`),
              );
          } catch (err) {
            log(err);
          }

          try {
            await E(bob)
              .tryToColorERTP()
              .then(
                _res => log('uh oh, bob was able to color'),
                rej => log(`bob was unable to color: ${rej}`),
              );
          } catch (err) {
            log(err);
          }
        },
        async doTapFaucetAndStore() {
          log('++ alice.doTapFaucetAndStore starting');
          const pixels = E(gallery).tapFaucet();

          storedUseObj = pixels;
          storedERTPAsset = await E(pixels).getERTP();

          const rawPixels = await E(storedUseObj).getRawPixels();
          return rawPixels[0];
        },
        async checkAfterRevoked() {
          log('++ alice.checkAfterRevoked starting');
          // changeColor throws an Error with an empty payment
          // check transferRight is empty
          E(storedUseObj)
            .changeColorAll(
              '#9FBF95', // a light green
            )
            .then(
              _res => log(`successfully changed color, but shouldn't`),
              rej => log(`successfully threw ${rej}`),
            );

          const amount = await E(storedERTPAsset).getBalance();
          log(
            `amount quantity should be an array of length 0: ${amount.quantity.length}`,
          );
        },
        async doSellAndBuy() {
          log('++ alice.doSellAndBuy starting');
          const pixels = E(gallery).tapFaucet();
          const { pixelIssuer, dustIssuer } = await E(gallery).getIssuers();

          const payment = await E(pixels).getERTP();
          const amount = await E(payment).getBalance();

          // sellToGallery creates a escrow smart contract with the
          // terms of the amount parameter plus what the gallery is
          // willing to offer for it
          // sellToGallery returns an invite to the smart contract
          const { inviteP, host } = await E(gallery).sellToGallery(amount);
          const seatP = E(host).redeem(inviteP);
          await E(seatP).offer(payment);
          const dustPurseP = E(dustIssuer).makeEmptyPurse();
          const pixelPurseP = E(pixelIssuer).makeEmptyPurse();
          await E(gallery).collectFromGallery(
            seatP,
            dustPurseP,
            pixelPurseP,
            'alice escrow',
          );
          // now buy it back
          const {
            inviteP: buyBackInviteP,
            host: buyBackHost,
            dustNeeded,
          } = await E(gallery).buyFromGallery(amount);
          const buyBackSeatP = await E(buyBackHost).redeem(buyBackInviteP);
          const dustPaymentP = await E(dustPurseP).withdraw(dustNeeded);

          E(buyBackSeatP).offer(dustPaymentP);
          // alice is buying a pixel, so her win purse is a pixel
          // purse and her refund purse is a dust purse
          await E(gallery).collectFromGallery(
            buyBackSeatP,
            pixelPurseP,
            dustPurseP,
            'alice escrow 2',
          );
          showPaymentBalance('alice pixel purse', pixelPurseP);
          showPaymentBalance('alice dust purse', dustPurseP);
        },
        async doTapFaucetAndOfferViaCorkboard(handoffSvc, dustPurseP) {
          log('++ alice.doTapFaucetAndOfferViaCorkboard starting');
          const { pixelIssuer } = await E(gallery).getIssuers();
          const pixels = E(gallery).tapFaucet();
          const payment = E(pixels).getERTP();

          const { buyerInviteP } = await createSaleOffer(payment, dustPurseP);

          // store buyerInviteP and contractHost in corkboard
          const cbP = E(handoffSvc).createBoard('MeetPoint');
          const buyerSeatReceipt = E(cbP).addEntry('buyerSeat', buyerInviteP);
          const contractHostReceipt = E(cbP).addEntry(
            'contractHost',
            contractHost,
          );

          const pixelRefundP = E(pixelIssuer).makeEmptyPurse('refund');
          return {
            aliceRefundP: pixelRefundP,
            alicePaymentP: dustPurseP,
            buyerSeatReceipt,
            contractHostReceipt,
          };
        },
        async doCreateFakeChild(bob) {
          log('++ alice.doCreateFakeChild starting');
          const { pixelIssuer } = await E(gallery).getIssuers();

          // create a fake childMint controlled entirely by Alice
          function makeUseObj(issuer, asset) {
            const useObj = harden({
              changeColor(amount, _newColor) {
                return amount;
              },
              changeColorAll(newColor) {
                return useObj.changeColor(asset.getBalance(), newColor);
              },
              getRawPixels() {
                const assay = issuer.getAssay();
                const pixelList = assay.quantity(asset.getBalance());
                return pixelList;
              },
              getColors() {
                const pixelList = useObj.getRawPixels();
                const colors = [];
                for (const pixel of pixelList) {
                  colors.push(gallery.getPixelColor(pixel.x, pixel.y));
                }
                return colors;
              },
              getERTP() {
                return asset;
              },
            });
            return useObj;
          }

          const { makePixelConfig } = makePixelConfigMaker(
            harden(makeUseObj),
            10,
            harden(pixelIssuer),
          );

          const fakeChildMint = makeMint('pixels', makePixelConfig);

          // use the fakeChildMint to create a payment to trick Bob
          const fakeChildIssuer = E(fakeChildMint).getIssuer();
          const fakeChildAssay = await E(fakeChildIssuer).getAssay();
          const fakeChildPurse = E(fakeChildMint).mint(
            fakeChildAssay.make(harden([{ x: 0, y: 1 }])),
          );
          const fakeChildPayment = E(fakeChildPurse).withdrawAll();

          await E(bob).receiveSuspiciousPayment(fakeChildPayment);

          // Note that the gallery cannot revoke anything that Alice
          // makes with her fakeChildMint, but this makes sense since
          // it is not a real child.
        },
      });
      return alice;
    },
  });
}

function setup(syscall, state, helpers) {
  function log(...args) {
    helpers.log(...args);
    console.log(...args);
  }
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeAliceMaker(host) {
        return harden(makeAliceMaker(E, log, host));
      },
    }),
  );
}
export default harden(setup);
