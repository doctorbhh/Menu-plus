export default function MenuPreview({ menuData }) {
  if (!menuData || !menuData.menu) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div>
        <p>Upload a menu file to see the preview</p>
      </div>
    );
  }

  const { vegNonVeg, special } = menuData.menu;
  const allDays = [...vegNonVeg, ...special];

  if (allDays.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">⚠️</div>
        <p>No menu items found in the file</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{menuData.month || 'Unknown'}</span>
          <span className="stat-label">Month</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{vegNonVeg.length}</span>
          <span className="stat-label">Days (Veg/Non-Veg)</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{special.length}</span>
          <span className="stat-label">Days (Special)</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{menuData.sheets?.join(', ') || 'N/A'}</span>
          <span className="stat-label">Sheets Found</span>
        </div>
      </div>

      {/* Veg & Non-Veg Section */}
      {vegNonVeg.length > 0 && (
        <>
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-green)' }}>
            🥗 Veg & Non-Veg Menu
          </h3>
          <div className="days-grid">
            {vegNonVeg.map((day, index) => (
              <DayCard key={`veg-${index}`} day={day} />
            ))}
          </div>
        </>
      )}

      {/* Special Section */}
      {special.length > 0 && (
        <>
          <h3 style={{ margin: '2rem 0 1rem', color: 'var(--accent-orange)' }}>
            ⭐ Special Menu
          </h3>
          <div className="days-grid">
            {special.map((day, index) => (
              <DayCard key={`special-${index}`} day={day} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DayCard({ day }) {
  const { meals = {} } = day;
  
  return (
    <div className="day-card">
      <div className="day-header">
        <span className="day-name">{day.day}</span>
        {day.dates && day.dates.length > 0 && (
          <span className="day-dates">
            📅 {day.dates.join(', ')}
          </span>
        )}
      </div>
      
      {meals.breakfast && meals.breakfast.length > 0 && (
        <div className="meal-section">
          <div className="meal-label breakfast">☀️ Breakfast</div>
          <div className="meal-items">{meals.breakfast.slice(0, 5).join(' • ')}</div>
        </div>
      )}
      
      {meals.lunch && meals.lunch.length > 0 && (
        <div className="meal-section">
          <div className="meal-label lunch">🍽️ Lunch</div>
          <div className="meal-items">{meals.lunch.slice(0, 5).join(' • ')}</div>
        </div>
      )}
      
      {meals.snacks && meals.snacks.length > 0 && (
        <div className="meal-section">
          <div className="meal-label snacks">🍪 Snacks</div>
          <div className="meal-items">{meals.snacks.slice(0, 5).join(' • ')}</div>
        </div>
      )}
      
      {meals.dinner && meals.dinner.length > 0 && (
        <div className="meal-section">
          <div className="meal-label dinner">🌙 Dinner</div>
          <div className="meal-items">{meals.dinner.slice(0, 5).join(' • ')}</div>
        </div>
      )}
    </div>
  );
}
