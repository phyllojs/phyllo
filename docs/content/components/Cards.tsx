export default function Cards({
  items,
}: {
  items: Array<{ title: string; text: string }>;
}) {
  return (
    <div className="site-cards">
      {items.map(item => (
        <div className="site-card" key={item.title}>
          <h3 className="site-card-title">{item.title}</h3>
          <p className="site-card-text">{item.text}</p>
        </div>
      ))}
    </div>
  );
}
