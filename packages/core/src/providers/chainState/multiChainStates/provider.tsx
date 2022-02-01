import { ReactNode, useEffect, useMemo, useReducer } from 'react'
import { useDebouncePair } from '../../../hooks'
import { MultiChainStatesContext } from './context'
import { callsReducer, ChainId, chainStateReducer, State, useNetwork } from '../../..'
import { useReadonlyNetworks } from '../../network'
import { useBlockNumbers } from '../../blockNumber/blockNumbers'
import { fromEntries } from '../../../helpers/fromEntries'
import { performMulticall } from '../common/performMulticall'
import { getUnique } from '../common/getUnique'
import { Providers } from '../../network/readonlyNetworks/model'
import { JsonRpcProvider } from '@ethersproject/providers'

interface Props {
  children: ReactNode
  multicallAddresses: {
    [chainId: number]: string
  }
}

function composeChainState(networks: Providers, state: State, multicallAddresses: Props['multicallAddresses']) {
  return fromEntries(
    Object.keys(networks).map((chainId) => [
      Number(chainId),
      {
        value: state[Number(chainId)],
        multicallAddress: multicallAddresses[Number(chainId)],
      },
    ])
  )
}

export function MultiChainStateProvider({ children, multicallAddresses }: Props) {
  const networks = useReadonlyNetworks()
  const blockNumbers = useBlockNumbers()
  const { reportError } = useNetwork()

  const [calls, dispatchCalls] = useReducer(callsReducer, [])
  const [state, dispatchState] = useReducer(chainStateReducer, {})

  const [debouncedCalls, debouncedNetworks] = useDebouncePair(calls, networks, 50)
  const uniqueCalls = debouncedNetworks === networks ? getUnique(debouncedCalls) : []
  // used for deep equality in hook dependencies
  const uniqueCallsJSON = JSON.stringify(uniqueCalls)

  function multicallForChain(chainId: ChainId, provider?: JsonRpcProvider) {
    const blockNumber = blockNumbers[chainId]
    const multicallAddress = multicallAddresses[chainId]

    if (!provider || !blockNumber) {
      return
    }
    if (!multicallAddress) {
      reportError(new Error(`Missing multicall address for chain id ${chainId}`))
      return
    }
    const callsOnThisChain = uniqueCalls.filter((call) => call.chainId === chainId)
    if (callsOnThisChain.length === 0) {
      return
    }
    performMulticall(provider, multicallAddress, blockNumber, callsOnThisChain, dispatchState, chainId, reportError)
  }

  useEffect(() => {
    for (const [_chainId, provider] of Object.entries(networks)) {
      multicallForChain(Number(_chainId), provider)
    }
  }, [blockNumbers, networks, multicallAddresses, uniqueCallsJSON])

  const chains = useMemo(() => composeChainState(networks, state, multicallAddresses), [
    state,
    multicallAddresses,
    networks,
  ])

  const provided = { chains, dispatchCalls }

  return <MultiChainStatesContext.Provider value={provided} children={children} />
}
