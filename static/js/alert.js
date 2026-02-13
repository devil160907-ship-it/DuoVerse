// Custom Alert System
class CustomAlert {
    constructor() {
        this.overlay = null;
    }

    show(title, message, type = 'info', onConfirm = null) {
        // Remove any existing alert
        this.hide();

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'custom-alert-overlay fade-in';
        
        // Create alert box
        const alertBox = document.createElement('div');
        alertBox.className = 'custom-alert';
        
        // Add title
        const titleEl = document.createElement('h2');
        titleEl.className = 'custom-alert-title';
        titleEl.textContent = title;
        
        // Add message
        const messageEl = document.createElement('p');
        messageEl.className = 'custom-alert-message';
        messageEl.textContent = message;
        
        // Add buttons
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'custom-alert-buttons';
        
        const okButton = document.createElement('button');
        okButton.className = 'glow-button';
        okButton.textContent = 'OK';
        okButton.onclick = () => {
            this.hide();
            if (onConfirm) onConfirm();
        };
        
        buttonsDiv.appendChild(okButton);
        
        // Assemble alert
        alertBox.appendChild(titleEl);
        alertBox.appendChild(messageEl);
        alertBox.appendChild(buttonsDiv);
        this.overlay.appendChild(alertBox);
        
        // Add to body
        document.body.appendChild(this.overlay);
    }

    confirm(title, message, onConfirm, onCancel) {
        // Remove any existing alert
        this.hide();

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'custom-alert-overlay fade-in';
        
        // Create alert box
        const alertBox = document.createElement('div');
        alertBox.className = 'custom-alert';
        
        // Add title
        const titleEl = document.createElement('h2');
        titleEl.className = 'custom-alert-title';
        titleEl.textContent = title;
        
        // Add message
        const messageEl = document.createElement('p');
        messageEl.className = 'custom-alert-message';
        messageEl.textContent = message;
        
        // Add buttons
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'custom-alert-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'control-btn';
        cancelButton.textContent = 'Cancel';
        cancelButton.onclick = () => {
            this.hide();
            if (onCancel) onCancel();
        };
        
        const confirmButton = document.createElement('button');
        confirmButton.className = 'glow-button';
        confirmButton.textContent = 'Confirm';
        confirmButton.onclick = () => {
            this.hide();
            if (onConfirm) onConfirm();
        };
        
        buttonsDiv.appendChild(cancelButton);
        buttonsDiv.appendChild(confirmButton);
        
        // Assemble alert
        alertBox.appendChild(titleEl);
        alertBox.appendChild(messageEl);
        alertBox.appendChild(buttonsDiv);
        this.overlay.appendChild(alertBox);
        
        // Add to body
        document.body.appendChild(this.overlay);
    }

    hide() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}

// Create global instance
const alertSystem = new CustomAlert();