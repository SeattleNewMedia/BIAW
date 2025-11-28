// utils/formatDate.js

function formatDate(dateString, format = "MM/DD/YYYY") {
  const date = new Date(dateString);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  if (format === "MM/DD/YYYY") {
    return `${mm}/${dd}/${yyyy}`;
  }
  return dateString;
}

module.exports = formatDate; 