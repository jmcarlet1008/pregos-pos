import { DeviceConnectForm } from './DeviceConnectForm'
import { runSyncCycle } from '../../sync/syncEngine'

/**
 * Shown instead of the PIN pad when this device has never connected to the shared
 * staff account (see lib/deviceAuth.ts) — a brand-new iPad, or one that's been reset.
 *
 * Why this has to exist pre-login rather than staff just using the PIN screen as usual:
 * once users/shifts/stock_adjustments were scoped to the authenticated device session
 * (see supabase/migrations/*_device_auth_rls.sql), an unconnected device can no longer
 * pull the real staff list at all — Settings -> Device Connection (where this used to
 * only live) is itself behind PIN login, which would be a chicken-and-egg problem for a
 * genuinely new device. This screen breaks that loop: a manager connects the device
 * here, first, before any PIN has to work.
 */
export function DeviceSetupScreen() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <div className="hidden w-[45%] flex-col justify-between border-r border-outline-variant bg-surface-container-low p-md md:flex">
        <div className="flex h-full flex-col items-center justify-center gap-md text-center">
          <span className="text-display-lg text-primary">Prego's Cucina</span>
          <span className="text-body-lg text-on-surface-variant">Pizza . Pasta . Chicken</span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center gap-8 p-md md:w-[55%]">
        <div className="flex w-full max-w-[448px] flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-headline-lg text-on-surface">Connect This Device</h1>
            <p className="text-body-md text-on-surface-variant">
              This device hasn't been set up yet. A manager needs to connect it to the restaurant's staff
              account once — after that, PIN login works normally on this device.
            </p>
          </div>

          <div className="w-full max-w-[320px]">
            <DeviceConnectForm onConnected={() => void runSyncCycle()} />
          </div>
        </div>
      </div>
    </div>
  )
}
