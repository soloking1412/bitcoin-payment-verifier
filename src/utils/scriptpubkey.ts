import * as bitcoin from 'bitcoinjs-lib';
import { BitcoinNetwork } from '../types';

export function getNetwork(network: BitcoinNetwork): bitcoin.Network {
  switch (network) {
    case 'mainnet': return bitcoin.networks.bitcoin;
    case 'testnet': return bitcoin.networks.testnet;
    case 'regtest': return bitcoin.networks.regtest;
  }
}

export function addressToScriptPubKey(address: string, network: BitcoinNetwork): Buffer {
  return bitcoin.address.toOutputScript(address, getNetwork(network));
}

export function scriptPubKeyToAddress(script: Buffer, network: BitcoinNetwork): string {
  return bitcoin.address.fromOutputScript(script, getNetwork(network));
}
