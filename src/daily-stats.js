const tehranDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit"
})

export function reportDate(now = new Date()) {
  return tehranDate.format(now)
}

export function formatDailyStats({ contacts, consultations }) {
  return `📊 آمار ۲۴ ساعت گذشته\n\n📱 اشتراک شماره تماس: ${contacts} نفر\n📞 درخواست مشاوره: ${consultations} نفر`
}
