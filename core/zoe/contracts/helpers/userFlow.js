import harden from '@agoric/harden';

export const rejectOffer = (
  zoe,
  assays,
  inviteHandle,
  message = `The offer was invalid. Please check your refund.`,
) => {
  zoe.complete(harden([inviteHandle]), assays);
  throw new Error(`${message}`);
};

export const defaultAcceptanceMsg = `The offer has been accepted. Once the contract has been completed, please check your payout`;
