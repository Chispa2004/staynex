export const UBIKOS_MOCK_DATA = {
  reservations: [
    {
      id: '53108',
      localizador: '53108',
      estado: 'CONFIRMADA',
      titular: 'Cristian Cabre',
      telefono: '+34600000001',
      correo: 'cristian.cabre@example.com',
      habitacion: '302',
      tipo_habitacion: 'Vista mar DOUBLE ROOM',
      entrada: '28-05-2026',
      salida: '29-05-2026',
      adultos: 2,
      ninos: 0,
      regimen: 'Solo alojamiento',
      agencia: 'HOTEL (CLIENTES DIRECTOS)',
      canal: 'Directo',
      pendiente: -188.00,
      moneda: 'EUR',
      observaciones: 'Reserva observada en Ubikos para validacion sandbox Staynex'
    },
    {
      id: 'UBK-ARR-20260528-01',
      localizador: 'ARR-2805-01',
      estado: 'CONFIRMADA',
      titular: 'Marta Sanz',
      telefono: '+34600000002',
      correo: 'marta.sanz@example.com',
      habitacion: '204',
      tipo_habitacion: 'DOUBLE ROOM',
      entrada: '28-05-2026',
      salida: '31-05-2026',
      adultos: 2,
      ninos: 1,
      regimen: 'Desayuno incluido',
      agencia: 'Booking.com',
      canal: 'OTA',
      pendiente: 122.50,
      moneda: 'EUR',
      observaciones: 'Llegada prevista tarde'
    },
    {
      id: 'UBK-DEP-20260528-01',
      localizador: 'DEP-2805-01',
      estado: 'ALOJADO',
      titular: 'Laura Martin',
      telefono: '+34600000003',
      correo: 'laura.martin@example.com',
      habitacion: '105',
      tipo_habitacion: 'STANDARD ROOM',
      entrada: '25-05-2026',
      salida: '28-05-2026',
      adultos: 1,
      ninos: 0,
      regimen: 'Media pension',
      agencia: 'HOTEL (CLIENTES DIRECTOS)',
      canal: 'Directo',
      pendiente: 64.00,
      moneda: 'EUR',
      observaciones: 'Salida pendiente de folio'
    }
  ],
  guests: [
    {
      id: 'guest-53108',
      nombre: 'Cristian Cabre',
      telefono: '+34600000001',
      correo: 'cristian.cabre@example.com',
      idioma: 'es',
      nacionalidad: 'ES',
      preferencias: ['habitacion_vista_mar'],
      observaciones: 'Titular de reserva 53108',
      vip: false,
      blacklist: false
    },
    {
      id: 'guest-inhouse-203',
      nombre: 'Gregorio Pelai',
      telefono: '+34600000004',
      correo: 'gregorio.pelai@example.com',
      idioma: 'es',
      nacionalidad: 'ES',
      preferencias: ['cama_doble', 'piso_alto'],
      observaciones: 'Alojado en habitacion 203. Revisar preferencias antes de salida.',
      vip: false,
      blacklist: false
    }
  ],
  rooms: [
    {
      habitacion: '203',
      tipo_habitacion: 'DOUBLE ROOM',
      estado: 'ocupada',
      huesped: 'Gregorio Pelai',
      reserva_id: 'UBK-INHOUSE-203',
      incidencias: [],
      observaciones: 'Alojado con observaciones y preferencias'
    },
    {
      habitacion: '302',
      tipo_habitacion: 'Vista mar DOUBLE ROOM',
      estado: 'libre',
      huesped: null,
      reserva_id: '53108',
      incidencias: []
    },
    {
      habitacion: '308',
      tipo_habitacion: 'DOUBLE ROOM',
      estado: 'retenida',
      huesped: null,
      reserva_id: null,
      incidencias: ['olor tabaco'],
      observaciones: 'Retenida por olor tabaco'
    },
    {
      habitacion: '105',
      tipo_habitacion: 'STANDARD ROOM',
      estado: 'ocupada',
      huesped: 'Laura Martin',
      reserva_id: 'UBK-DEP-20260528-01',
      incidencias: []
    },
    {
      habitacion: '204',
      tipo_habitacion: 'DOUBLE ROOM',
      estado: 'limpia',
      huesped: null,
      reserva_id: 'UBK-ARR-20260528-01',
      incidencias: []
    }
  ],
  folios: [
    {
      reserva_id: '53108',
      moneda: 'EUR',
      total_charges: 188.00,
      total_paid: 376.00,
      pendiente: -188.00,
      cargos: [
        { concepto: 'Alojamiento', tipo: 'room', importe: 188.00, fecha: '28-05-2026', estado: 'posted' }
      ],
      pagos: [
        { concepto: 'Prepago', importe: 376.00, fecha: '28-05-2026', metodo: 'card' }
      ],
      warnings: ['negative_balance_observed_in_ubikos_mock']
    },
    {
      reserva_id: 'UBK-DEP-20260528-01',
      moneda: 'EUR',
      total_charges: 214.00,
      total_paid: 150.00,
      pendiente: 64.00,
      cargos: [
        { concepto: 'Minibar', tipo: 'minibar', importe: 18.00, fecha: '27-05-2026', estado: 'posted' },
        { concepto: 'Restaurante', tipo: 'restaurant', importe: 46.00, fecha: '27-05-2026', estado: 'posted' },
        { concepto: 'Alojamiento', tipo: 'room', importe: 150.00, fecha: '25-05-2026', estado: 'posted' }
      ],
      pagos: [
        { concepto: 'Pago tarjeta', importe: 150.00, fecha: '25-05-2026', metodo: 'card' }
      ],
      warnings: []
    }
  ],
  hotelStatus: {
    habitaciones_totales: 42,
    disponibles: 16,
    ocupadas: 24,
    entradas_pendientes: 4,
    salidas_pendientes: 3,
    roomnights: 31,
    ocupacion: 57.14
  }
};
