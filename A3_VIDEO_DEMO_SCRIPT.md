# ElderLink A3 Video Demonstration Script

## 1. Before Recording

Open PowerShell and start the application:

```powershell
cd D:\works\Vue\Junlin-Zhu-36668230-A3\ElderLink-A3
npm.cmd run dev
```

Open the address shown by Vite, normally:

`http://127.0.0.1:5173/`

Use a browser window large enough to show the page clearly. Keep the browser zoom at 100%.

Recommended recording style:

- Record the screen without switching between unrelated applications.
- Move the mouse slowly and pause after important results appear.
- Keep each page visible for at least a few seconds.
- Do not refresh the page unnecessarily because the application stores demo activity in browser local storage.

## 2. Opening Introduction

Start on the ElderLink A3 dashboard.

Say or show the following points:

1. ElderLink is an advanced community service coordination application.
2. It supports older adults, carers, and community coordinators.
3. The A3 extension adds external authentication, email workflows, interactive tables, map functionality, cloud-ready functions, accessibility features, export tools, and innovative features.
4. The application is built with Vue and uses dynamic JavaScript data structures.

Briefly point to the top statistics:

- Services in directory
- Support requests tracked
- Bookings with scheduling rules
- Outbound email records

## 3. Authentication Demonstration

Use the authentication panel on the left side.

### 3.1 Resident Login

Enter:

- Email: `margaret@elderlink.demo`
- Password: `Welcome123`

Click `Log in`.

Expected result:

- The authentication panel displays Margaret Wilson.
- The role pill shows `resident`.
- A success message confirms the login.

Explain:

- The application has an external Firebase Auth adapter.
- When Firebase credentials are configured, the adapter can use Firebase Auth.
- The current demo also has a fallback mode so the complete interface can be demonstrated safely without depending on live credentials.

### 3.2 Google-Style External Sign-In

Click `Log out`.

Click `Sign in with Google`.

Expected result:

- A demo Google user is signed in.
- The notice explains whether Firebase mode or demo fallback mode is active.

Explain that the application supports an external provider flow and can switch to a configured Firebase Google provider.

### 3.3 Registration Validation

Click `Log out`.

In the registration section, enter an invalid password such as:

`password`

Click `Create account`.

Expected result:

- The application rejects the password.
- The notice explains that the password must include letters and numbers and meet the minimum length.

Then enter a valid example:

- Full name: `Demo Resident`
- Email: `demo.resident@example.com`
- Password: `Welcome123`
- Role: `Resident / carer`

Click `Create account`.

Expected result:

- A new local demo account is created.
- The user is signed in automatically.

## 4. Directory and Support Request Demonstration

Click `Directory` in the navigation bar.

### 4.1 Service Search and Filters

In `Search services`, type:

`transport`

Expected result:

- Only transport-related service cards remain visible.

Change the category filter to:

`Advice`

Change the audience filter to:

`Carers`

Expected result:

- The service cards update dynamically.
- The page demonstrates Vue computed filtering and JavaScript data structures.

Explain that services are not hard-coded separately in the HTML. They are generated from the `services` data structure.

### 4.2 Support Request Validation

Scroll to the `Support request triage` form.

Click `Submit request` without completing the fields.

Expected result:

- The application rejects the request and identifies missing fields.

Enter an invalid email, such as:

`wrong-email`

Expected result:

- The email validation message appears.

Enter a valid request:

- Name: `Demo Resident`
- Email: `demo.resident@example.com`
- Phone: `0400 123 456`
- Subject: `Transport support`
- Message: `I need help arranging transport to a medical appointment next week.`

Click `Submit request`.

Expected result:

- The request is added to the application.
- The request is automatically triaged as Low, Medium, or High priority.
- The notice explains the recommended follow-up channel.

Explain:

- The request is processed by a cloud-function-style triage adapter.
- In a deployed backend, this logic can be moved to Firebase Cloud Functions.

### 4.3 Interactive Service Table

Scroll to the `Service table`.

Demonstrate column search:

1. Enter `Transport` in the category filter.
2. Enter `Box Hill` in the suburb filter.

Expected result:

- The table updates using individual column filters.

Demonstrate sorting:

1. Click the `Name` table heading.
2. Click it again to reverse the order.

Expected result:

- The rows change between ascending and descending order.

Demonstrate pagination:

1. Clear the column filters.
2. Click `Next`.

Expected result:

- The table moves to another page.
- The page size remains limited to 10 rows.

Explain that this satisfies the advanced interactive table requirement.

### 4.4 CSV Export

Click `Export services CSV`.

Expected result:

- A file named `elderlink-services.csv` downloads.

If showing the downloaded file, open it briefly and show that it contains service names, categories, suburbs, audiences, phone numbers, and costs.

## 5. Map and Geo-location Demonstration

Click `Map`.

Wait for the map to load.

### 5.1 Nearby Service Search

Use the `Starting hub` selector and choose:

`Box Hill`

Set the radius slider to approximately:

`8 km`

Expected result:

- The map shows the selected starting point.
- Nearby service markers appear.
- The nearby results panel lists service names and distances.

Explain that the first map feature is radius-based nearby service discovery.

### 5.2 Destination and Route Summary

Change `Destination service` to:

`Care Navigator Studio`

Change `Travel mode` between:

- Car
- Public transport
- Walk

Expected result:

- The distance remains based on the selected locations.
- The estimated travel time changes according to the selected travel mode.
- A dashed route line connects the starting point and destination.

Explain that the second map feature is trip information and route estimation.

### 5.3 Browser Geolocation

Click `Use current location`.

If the browser asks for permission, choose `Allow`.

Expected result:

- The application uses the browser's location when permission is available.

If permission is unavailable:

- Explain that the application safely keeps the selected suburb hub as a fallback.

## 6. Booking Demonstration

Click `Bookings`.

Log in as the resident if required:

- Email: `margaret@elderlink.demo`
- Password: `Welcome123`

### 6.1 Booking Constraint Validation

In the booking form, choose a date less than 48 hours away or a weekend date.

Click `Create booking`.

Expected result:

- The application rejects the booking.
- The notice explains either the 48-hour notice rule or the weekday-only rule.

### 6.2 Successful Booking

Use a future weekday date. A suitable demonstration date is:

`2026-08-25`

Complete:

- Service: `Friendly Transport Plus`
- Date: `2026-08-25`
- Time: `10:00`
- Mode: `Van escort`
- Seats: `1`
- Notes: `Please provide an accessible pickup arrangement.`

Click `Create booking`.

Expected result:

- The booking is added to the booking table.
- The status is either `Confirmed` or `Waitlisted`.
- The notice explains the capacity result.

Explain:

- The application checks the selected date.
- It checks the number of seats.
- It checks the existing bookings for the same service and time.
- It automatically waitlists a booking when capacity is unavailable.

### 6.3 Booking Table

Demonstrate the booking table:

1. Search by resident name.
2. Search by service name.
3. Search by booking status.
4. Click `Date` to sort.
5. Click `Next` to show pagination.

Explain that this is the second interactive table required by BR D.3.

### 6.4 PDF and CSV Export

Click:

- `Export bookings PDF`
- `Export requests CSV`

Expected result:

- A PDF booking summary downloads.
- A CSV support request export downloads.

Explain that the application supports multiple export formats.

## 7. Coordinator Dashboard Demonstration

Click `Log out`.

Log in using:

- Email: `priya@elderlink.demo`
- Password: `Coordinator123`

Click `Coordinator`.

Expected result:

- The coordinator dashboard opens.
- The dashboard shows charts, bulk email tools, operational summaries, and email logs.

If a resident tries to open this page, demonstrate that access is denied. This shows role-based access control.

## 8. Interactive Charts Demonstration

In the Coordinator dashboard, show:

- `Services by category`
- `Status pressure view`

Explain:

- The charts are generated from live reactive application data.
- Adding a request or booking changes the underlying counts.
- The charts help coordinators understand service demand and operational pressure.

Point out that the chart design remains readable on smaller screens.

## 9. Bulk Email Demonstration

In `Bulk email composer`, choose:

`Open requests`

Enter:

- Subject: `Important ElderLink service update`
- Message: `This is a demonstration message for users with open support requests. Please contact the coordinator if your needs have changed.`

Optionally attach a small PDF or text file.

Click `Send bulk email`.

Expected result:

- The application reports the number of matched recipients.
- Email records appear in the operational summary.
- The delivery mode is shown as configured integration mode or demo mode.

Explain:

- The frontend validates the subject, message, and attachment type.
- The email adapter is prepared for EmailJS or a cloud endpoint.
- The Firebase Cloud Function includes a SendGrid-compatible attachment flow.

## 10. Accessibility Demonstration

At the top navigation, click:

`High contrast`

Expected result:

- The colour contrast becomes stronger.

Click:

`Large text`

Expected result:

- The interface text increases in size.

Optional keyboard demonstration:

1. Press `Tab` repeatedly.
2. Show that buttons, navigation controls, inputs, and table controls receive focus.
3. Press `Enter` on a focused navigation button.

Explain:

- The application includes a skip link.
- Forms have visible labels.
- Notices use an accessible live region.
- Controls are keyboard reachable.
- The interface supports high contrast and larger text modes.

## 11. Final Summary

End the recording on the Coordinator dashboard or Directory page.

Summarise the completed requirements:

- `D.1`: Firebase-ready external authentication with demo fallback.
- `D.2`: Bulk email workflow with attachment validation and cloud endpoint support.
- `D.3`: Two interactive tables with search, sorting, and 10-row pagination.
- `D.4`: Production build and GitHub Pages deployment workflow.
- `E.1`: Firebase Cloud Functions code for email and booking-related backend tasks.
- `E.2`: Map-based nearby search and route information.
- `E.3`: Accessibility controls and keyboard-friendly interaction.
- `E.4`: CSV and PDF export.
- `F.1`: Appointment booking constraints, bulk email, interactive charts, and admin dashboard.

Mention that the application was tested locally with:

```powershell
npm.cmd run build
npm.cmd run dev
```

## 12. Suggested Recording Length

- Introduction: 30 seconds
- Authentication: 1 minute
- Directory and tables: 2 minutes
- Map and routing: 1.5 minutes
- Bookings and exports: 2 minutes
- Coordinator dashboard, charts, and bulk email: 2 minutes
- Accessibility and final summary: 1 minute

Recommended total length: approximately 9 to 10 minutes.

## 13. Troubleshooting During Recording

### The page is not loading

Run:

```powershell
cd D:\works\Vue\Junlin-Zhu-36668230-A3\ElderLink-A3
npm.cmd run dev
```

Then open:

`http://127.0.0.1:5173/`

### Firebase login is unavailable

Continue the demonstration using the built-in demo accounts. The application will display demo fallback mode while the Firebase adapter remains configured for real credentials.

### The map tiles are slow

Wait a few seconds. The service markers and route summary can still be demonstrated even if external map tiles load slowly.

### A previous demo changed the data

The application uses local storage. To reset the demo data, open the browser developer console and run:

```javascript
Object.keys(localStorage)
  .filter((key) => key.startsWith('elderlink-a3-'))
  .forEach((key) => localStorage.removeItem(key))
location.reload()
```

