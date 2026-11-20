import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsLiteral, LatLngExpression, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { WilayahAggRow } from '@/lib/wilayah-stats';
import { cn } from '@/lib/utils';

/** Peta dasar gratis dari OpenStreetMap (perlu koneksi internet untuk memuat tile). */
const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const INDONESIA_CENTER: LatLngExpression = [-2.5, 118];
const DEFAULT_ZOOM = 5;

type Props = {
  rows: WilayahAggRow[];
  className?: string;
};

function FitToMarkers({ points }: { points: LatLngTuple[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView(INDONESIA_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 7);
      return;
    }
    const bounds: LatLngBoundsLiteral = points;
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 7 });
  }, [map, points]);

  return null;
}

export function WilayahSebaranMap({ rows, className }: Props) {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.count)), [rows]);

  const markers = useMemo(() => {
    return rows
      .filter((r) => r.lat != null && r.lng != null && r.count > 0)
      .map((r) => ({
        ...r,
        position: [r.lat!, r.lng!] as LatLngTuple,
        radius: 6 + (r.count / max) * 18,
      }));
  }, [rows, max]);

  const fitPoints = useMemo(() => markers.map((m) => m.position), [markers]);

  if (markers.length === 0) {
    return (
      <div
        className={cn(
          'rounded-sm border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-xs text-slate-500',
          className
        )}
      >
        Belum ada data asal provinsi pada santri. Isi wilayah di profil santri untuk melihat peta.
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <MapContainer
        center={INDONESIA_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className="w-full h-52 sm:h-60 rounded-sm border border-slate-200/80 dark:border-slate-700 z-0"
        attributionControl
      >
        <TileLayer url={OSM_TILE} attribution={OSM_ATTRIBUTION} />
        <FitToMarkers points={fitPoints} />
        {markers.map((m) => (
          <CircleMarker
            key={m.code}
            center={m.position as LatLngExpression}
            radius={m.radius}
            pathOptions={{
              color: '#047857',
              weight: 1.5,
              fillColor: '#10b981',
              fillOpacity: 0.45,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <span className="text-xs font-semibold">{m.name}</span>
              <br />
              <span className="text-[11px]">{m.count} santri</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 px-0.5 leading-snug">
        Peta OpenStreetMap (gratis). Lingkaran = jumlah santri per provinsi. Perlu internet untuk
        memuat gambar peta.
      </p>
    </div>
  );
}
