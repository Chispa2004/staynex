export const getTicketResolutionCopy = (ticket) => {
  if (ticket.request_context?.responsible_role === 'reception') {
    return 'Recepción gestiona esta solicitud. Revisa el ticket y confirma la actuación antes de cerrarlo.';
  }
  const copilot = ticket.copilot || {};
  const housekeepingStatus = copilot.roomStatus?.housekeepingStatus || copilot.roomStatus?.housekeeping_status;
  const maintenanceStatus = copilot.roomStatus?.maintenanceStatus || copilot.roomStatus?.maintenance_status;
  const department = String(copilot.suggestedDepartment || '').toLowerCase();

  if (maintenanceStatus === 'maintenance' || maintenanceStatus === 'out_of_order') {
    return 'Confirma el estado con mantenimiento antes de cerrar el ticket.';
  }

  if (housekeepingStatus === 'dirty') {
    return 'Asigna pisos y responde al huésped cuando la habitación esté revisada.';
  }

  if (department.includes('maintenance') || ticket.category === 'maintenance') {
    return 'Asigna mantenimiento, confirma acceso a la habitación y avisa al huésped.';
  }

  if (department.includes('housekeeping') || ticket.category === 'housekeeping') {
    return 'Asigna pisos y marca el ticket como completado solo tras revisar la habitación.';
  }

  return 'Revisa el ticket y responde al huésped con el siguiente paso claro.';
};
