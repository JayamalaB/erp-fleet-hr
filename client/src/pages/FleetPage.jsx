import { useEffect, useState } from 'react';
import { api } from '../api';

function useLoader(loader, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loader()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);
  return [data, error, () => setReloadKey((k) => k + 1)];
}

export default function FleetPage() {
  const [error, setError] = useState('');
  const [models, , reloadModels] = useLoader(() => api.get('/api/fleet/vehicle-models'), []);
  const [vehicles, , reloadVehicles] = useLoader(() => api.get('/api/fleet/vehicles'), []);
  const [drivers, , reloadDrivers] = useLoader(() => api.get('/api/fleet/drivers'), []);
  const [contracts, , reloadContracts] = useLoader(() => api.get('/api/fleet/contracts'), []);
  const [trips, , reloadTrips] = useLoader(() => api.get('/api/fleet/trips'), []);

  const [modelForm, setModelForm] = useState({ make: '', model: '' });
  const [vehicleForm, setVehicleForm] = useState({ plateNo: '', vehicleModelId: '' });
  const [driverForm, setDriverForm] = useState({ name: '', licenseNo: '' });
  const [contractForm, setContractForm] = useState({ customerRef: '', rateType: 'flat', rateValue: 1500 });
  const [assignForm, setAssignForm] = useState({ vehicleId: '', driverId: '' });
  const [tripForm, setTripForm] = useState({ vehicleId: '', contractId: '', loadingInfo: '', deliveryInfo: '' });
  const [profile, setProfile] = useState(null);

  async function run(fn) {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  }

  const createModel = (e) => { e.preventDefault(); run(async () => { await api.post('/api/fleet/vehicle-models', modelForm); reloadModels(); }); };
  const createVehicle = (e) => { e.preventDefault(); run(async () => { await api.post('/api/fleet/vehicles', vehicleForm); reloadVehicles(); }); };
  const createDriver = (e) => { e.preventDefault(); run(async () => { await api.post('/api/fleet/drivers', driverForm); reloadDrivers(); }); };
  const createContract = (e) => { e.preventDefault(); run(async () => { await api.post('/api/fleet/contracts', { ...contractForm, rateValue: Number(contractForm.rateValue) }); reloadContracts(); }); };
  const assign = (e) => { e.preventDefault(); run(async () => { await api.post('/api/fleet/assignments', assignForm); reloadVehicles(); loadProfile(assignForm.vehicleId); }); };
  const createTrip = (e) => { e.preventDefault(); run(async () => { await api.post('/api/fleet/trips', tripForm); reloadTrips(); }); };
  const completeTrip = (id) => run(async () => { await api.post(`/api/fleet/trips/${id}/complete`, {}); reloadTrips(); });

  const loadProfile = (vehicleId) => run(async () => { setProfile(await api.get(`/api/fleet/vehicles/${vehicleId}/profile`)); });

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid">
        <div className="card">
          <h2>Vehicle Model</h2>
          <form className="inline" onSubmit={createModel}>
            <label>Make<input required value={modelForm.make} onChange={(e) => setModelForm({ ...modelForm, make: e.target.value })} /></label>
            <label>Model<input required value={modelForm.model} onChange={(e) => setModelForm({ ...modelForm, model: e.target.value })} /></label>
            <button type="submit">Create</button>
          </form>
        </div>

        <div className="card">
          <h2>Vehicle</h2>
          <form className="inline" onSubmit={createVehicle}>
            <label>Plate No<input required value={vehicleForm.plateNo} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNo: e.target.value })} /></label>
            <label>Model
              <select required value={vehicleForm.vehicleModelId} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleModelId: e.target.value })}>
                <option value="">select...</option>
                {(models || []).map((m) => <option key={m._id} value={m._id}>{m.make} {m.model}</option>)}
              </select>
            </label>
            <button type="submit">Create</button>
          </form>
          <table>
            <thead><tr><th>Plate</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(vehicles || []).map((v) => (
                <tr key={v._id}>
                  <td>{v.plateNo}</td>
                  <td><span className={`pill ${v.status === 'active' ? 'ok' : 'warn'}`}>{v.status}</span></td>
                  <td><button className="secondary" onClick={() => loadProfile(v._id)}>Profile</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Driver</h2>
          <form className="inline" onSubmit={createDriver}>
            <label>Name<input required value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} /></label>
            <label>License No<input required value={driverForm.licenseNo} onChange={(e) => setDriverForm({ ...driverForm, licenseNo: e.target.value })} /></label>
            <button type="submit">Create</button>
          </form>
          <table>
            <thead><tr><th>Name</th><th>License</th></tr></thead>
            <tbody>{(drivers || []).map((d) => <tr key={d._id}><td>{d.name}</td><td>{d.licenseNo}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Assign Vehicle to Driver</h2>
        <p className="hint">Reassigning closes the current open assignment and opens a new one - full history is preserved, never overwritten.</p>
        <form className="inline" onSubmit={assign}>
          <label>Vehicle
            <select required value={assignForm.vehicleId} onChange={(e) => setAssignForm({ ...assignForm, vehicleId: e.target.value })}>
              <option value="">select...</option>
              {(vehicles || []).map((v) => <option key={v._id} value={v._id}>{v.plateNo}</option>)}
            </select>
          </label>
          <label>Driver
            <select required value={assignForm.driverId} onChange={(e) => setAssignForm({ ...assignForm, driverId: e.target.value })}>
              <option value="">select...</option>
              {(drivers || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
          <button type="submit">Assign</button>
        </form>
      </div>

      <div className="card">
        <h2>Contract</h2>
        <form className="inline" onSubmit={createContract}>
          <label>Customer Ref<input required value={contractForm.customerRef} onChange={(e) => setContractForm({ ...contractForm, customerRef: e.target.value })} /></label>
          <label>Rate Type
            <select value={contractForm.rateType} onChange={(e) => setContractForm({ ...contractForm, rateType: e.target.value })}>
              <option value="flat">flat</option>
              <option value="per_km">per_km</option>
            </select>
          </label>
          <label>Rate Value<input required type="number" value={contractForm.rateValue} onChange={(e) => setContractForm({ ...contractForm, rateValue: e.target.value })} /></label>
          <button type="submit">Create</button>
        </form>
      </div>

      <div className="card">
        <h2>Trip</h2>
        <p className="hint">Driver is auto-resolved from the vehicle's current assignment - it is never picked independently here.</p>
        <form className="inline" onSubmit={createTrip}>
          <label>Vehicle
            <select required value={tripForm.vehicleId} onChange={(e) => setTripForm({ ...tripForm, vehicleId: e.target.value })}>
              <option value="">select...</option>
              {(vehicles || []).filter((v) => v.status === 'active').map((v) => <option key={v._id} value={v._id}>{v.plateNo}</option>)}
            </select>
          </label>
          <label>Contract
            <select required value={tripForm.contractId} onChange={(e) => setTripForm({ ...tripForm, contractId: e.target.value })}>
              <option value="">select...</option>
              {(contracts || []).map((c) => <option key={c._id} value={c._id}>{c.customerRef}</option>)}
            </select>
          </label>
          <label>Loading<input value={tripForm.loadingInfo} onChange={(e) => setTripForm({ ...tripForm, loadingInfo: e.target.value })} /></label>
          <label>Delivery<input value={tripForm.deliveryInfo} onChange={(e) => setTripForm({ ...tripForm, deliveryInfo: e.target.value })} /></label>
          <button type="submit">Create Trip</button>
        </form>
        <table>
          <thead><tr><th>Amount</th><th>Status</th><th>Driver</th><th></th></tr></thead>
          <tbody>
            {(trips || []).map((t) => (
              <tr key={t._id}>
                <td>{t.amount}</td>
                <td><span className="pill">{t.status}</span></td>
                <td>{t.driverIdAtCompletion || t.driverId}</td>
                <td>{t.status !== 'completed' && t.status !== 'cancelled' && <button className="secondary" onClick={() => completeTrip(t._id)}>Complete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profile && (
        <div className="card">
          <h2>Vehicle Profile: {profile.vehicle.plateNo}</h2>
          <p>Current driver: <strong>{profile.currentAssignment?.driverId?.name || 'unassigned'}</strong></p>
          <p>Total cost to date: <strong>{profile.costs.totalCost}</strong> (maintenance {profile.costs.totalMaintenanceCost} + fuel {profile.costs.totalFuelCost})</p>
          <h3>Trip History</h3>
          <table>
            <thead><tr><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{profile.tripHistory.map((t) => <tr key={t._id}><td>{t.amount}</td><td>{t.status}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
